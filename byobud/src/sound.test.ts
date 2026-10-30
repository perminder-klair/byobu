import assert from "node:assert/strict";
import { test } from "node:test";
import { chimeWav, cueWav, parseInputs, parseOutputs } from "./sound.ts";

const STATUS = `PipeWire 'pipewire-0' [1.6.10, byobu@byobu, cookie:1]
Audio
 ├─ Devices:
 │      44. Built-in Audio                      [alsa]
 │
 ├─ Sinks:
 │  *   53. Built-in Audio Stereo               [vol: 0.50]
 │      61. USB Speakerphone Analog Stereo      [vol: 1.00]
 │
 ├─ Sources:
 │      62. USB Speakerphone Mono               [vol: 1.00]
 │
 └─ Streams:

Video
 ├─ Sinks:
 │      70. Some Video Sink
`;

test("reads the audio outputs and which one is in use", () => {
  assert.deepEqual(parseOutputs(STATUS), [
    { id: "53", name: "Built-in Audio Stereo", selected: true },
    { id: "61", name: "USB Speakerphone Analog Stereo", selected: false },
  ]);
});

test("reads the microphones", () => {
  assert.deepEqual(parseInputs(STATUS), [{ id: "62", name: "USB Speakerphone Mono", selected: false }]);
  assert.deepEqual(parseInputs("Audio\n ├─ Sinks:\n │      53. Speaker\n ├─ Sources:\n │\n ├─ Filters:\n"), []);
});

test("no outputs is fine", () => {
  assert.deepEqual(parseOutputs("Audio\n ├─ Devices:\n"), []);
});

test("the chime is a valid WAV that doesn't clip", () => {
  const wav = chimeWav();
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert.ok(peak > 8000 && peak < 32_000, `peak ${peak}`);
});

test("the cue is short enough to talk over", () => {
  const wav = cueWav();
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.ok(wav.length < 44_100, "well under a second");
});
