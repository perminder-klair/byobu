# The panel's ears, run by the assistant plugin as a process of its own, so a problem with the
# microphone or a model can't take byobud with it. It's Python because microWakeWord is, the one
# wake phrase engine that kept working over background noise. Nothing here leaves the panel.
#
# It says what happened as lines of JSON on stdout, and the plugin decides what to do about it and
# answers on stdin, one word to a line:
#   listen    take down what's said next, stopping once they've finished
#   hold      the same, until release
#   release   finished holding
import argparse
import collections
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "voice", "lib"))

import numpy as np
import sherpa_onnx
from pymicro_wakeword import MicroWakeWord, MicroWakeWordFeatures, Model

RATE = 16000
# Silero's window, a little over 30 ms, which is also how often the wake phrase gets a look.
CHUNK = 512
PER_SECOND = RATE / CHUNK
# What's kept from before the phrase was recognised, as people run straight on from it and it takes
# a moment to be sure of it. A bit of the phrase in the words is better than losing "turn off".
KEPT_SECONDS = 0.5
# How much of a clip to keep ahead of where speech was noticed, which is a little after it started.
LEAD_SECONDS = 0.4
# How long someone gets to start talking, and to finish.
WAIT_SECONDS = 5
MOST_SECONDS = 15
HOLD_SECONDS = 20
QUIET_SECONDS = 0.7
THREADS = 4


def say(**event):
    print(json.dumps(event), flush=True)


def commands():
    waiting = queue.Queue()

    def read():
        for line in sys.stdin:
            waiting.put(line.strip())
        # The plugin's gone, and there's nobody to tell.
        waiting.put("exit")

    threading.Thread(target=read, daemon=True).start()
    return waiting


class Microphone:
    def __init__(self):
        self.child = subprocess.Popen(
            ["pw-record", "--rate=16000", "--channels=1", "--format=s16", "--raw", "--latency=30ms", "-"],
            stdout=subprocess.PIPE,
        )

    def read(self):
        chunk = self.child.stdout.read(CHUNK * 2)
        if len(chunk) < CHUNK * 2:
            raise RuntimeError("the microphone stopped")
        return chunk

    def close(self):
        self.child.kill()
        self.child.wait()


class Phrase:
    def __init__(self, name, cutoff):
        self.detector = MicroWakeWord.from_builtin(Model[name.upper()])
        self.detector.probability_cutoff = cutoff
        self.features = MicroWakeWordFeatures()

    def said_in(self, chunk):
        frames = list(self.features.process_streaming(chunk))
        return any([self.detector.process_streaming(frame) for frame in frames])

    def reset(self):
        self.detector.reset()
        self.features.reset()


class Words:
    def __init__(self):
        self.recognizer = None

    # Waits for the first time it's needed, as it takes a few seconds and a few hundred megabytes.
    def load(self):
        model = os.path.join(HERE, "voice", "parakeet")
        self.recognizer = self.recognizer or sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
            model=os.path.join(model, "model.int8.onnx"),
            tokens=os.path.join(model, "tokens.txt"),
            num_threads=THREADS,
        )

    def of(self, samples):
        self.load()
        stream = self.recognizer.create_stream()
        stream.accept_waveform(RATE, np.concatenate([samples, np.zeros(RATE // 2, dtype=np.float32)]))
        self.recognizer.decode_stream(stream)
        return stream.result.text.strip()


class Clip:
    def __init__(self, voice, hold, before=()):
        self.voice = voice
        self.hold = hold
        self.before = list(before)
        self.chunks = []
        self.length = 0
        self.spoke = False

    def add(self, chunk):
        self.chunks.append(chunk)
        self.length += 1
        self.voice.accept_waveform(floats(chunk))
        talking = self.voice.is_speech_detected()
        while not self.voice.empty():
            self.voice.pop()
        if talking and not self.spoke:
            self.spoke = True
            # They paused, so this is where they start. Left in, a scrap of the phrase throws the
            # recogniser, and it stumbles over their first word.
            lead = round(LEAD_SECONDS * PER_SECOND)
            if len(self.chunks) > lead:
                self.before = []
                self.chunks = self.chunks[-lead:]
        seconds = self.length / PER_SECOND
        if self.hold:
            return seconds >= HOLD_SECONDS
        return seconds >= (MOST_SECONDS if self.spoke else WAIT_SECONDS) or (self.spoke and not talking)

    def samples(self):
        return floats(b"".join(self.before + self.chunks))


def floats(pcm):
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768


def speech_detector():
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = os.path.join(HERE, "voice", "silero_vad.onnx")
    config.silero_vad.min_silence_duration = QUIET_SECONDS
    config.silero_vad.min_speech_duration = 0.15
    config.silero_vad.window_size = CHUNK
    config.sample_rate = RATE
    config.num_threads = 1
    return sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=HOLD_SECONDS + 5)


def save(path, samples):
    with wave.open(path, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(RATE)
        file.writeframes((samples * 32767).astype(np.int16).tobytes())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wake", help="the phrase to listen for all the time, if any")
    parser.add_argument("--cutoff", type=float, help="how sure of the phrase to be, from 0 to 1")
    parser.add_argument("--clip", help="save what's said here for a speech server, rather than working it out here")
    options = parser.parse_args()
    # Stopping has to reach the finally below, or the recorder is left running with nobody reading.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    phrase = Phrase(options.wake, options.cutoff) if options.wake else None
    words = Words()
    # Someone who's set a phrase is going to use it, and shouldn't wait for the first answer.
    if phrase and not options.clip:
        words.load()
    voice = speech_detector()
    waiting = commands()
    recent = collections.deque(maxlen=round(KEPT_SECONDS * PER_SECOND))
    microphone = None
    clip = None
    say(ready=True)

    def finish():
        nonlocal clip
        done, clip = clip, None
        voice.reset()
        recent.clear()
        if phrase:
            phrase.reset()
        if not done.spoke:
            say(nothing=True)
        elif options.clip:
            save(options.clip, done.samples())
            say(clip=options.clip)
        else:
            say(heard=words.of(done.samples()))

    try:
        while True:
            # With nothing to listen for, the microphone stays closed and this waits for a command.
            wanted = bool(phrase or clip)
            if wanted and not microphone:
                microphone = Microphone()
            elif microphone and not wanted:
                microphone.close()
                microphone = None
            try:
                command = waiting.get(block=not wanted)
            except queue.Empty:
                command = None
            if command == "exit":
                return
            if command in ("listen", "hold") and not clip:
                clip = Clip(voice, hold=command == "hold", before=recent if command == "listen" else ())
                continue
            if command == "release" and clip:
                finish()
                continue
            if not microphone:
                continue

            chunk = microphone.read()
            if clip:
                if clip.add(chunk):
                    finish()
            else:
                recent.append(chunk)
                if phrase.said_in(chunk):
                    phrase.reset()
                    say(wake=True)
    finally:
        if microphone:
            microphone.close()


main()
