// Sound through PipeWire, which mixes everything that plays and follows speakers being plugged
// in. Volume and outputs go through wpctl, which comes with it. Where there's no PipeWire, like
// in tests, all of this quietly does nothing.
import { execFile, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Output } from "./protocol.ts";

const run = promisify(execFile);
const SINK = "@DEFAULT_AUDIO_SINK@";
const SAMPLE_RATE = 44_100;
// Three rising notes, each ringing out.
const NOTES = [
  { frequency: 660, at: 0 },
  { frequency: 880, at: 0.16 },
  { frequency: 1320, at: 0.32 },
];
const CHIME_SECONDS = 1;
// Two quick notes, over before anyone's finished saying what they wanted.
const CUE_NOTES = [
  { frequency: 880, at: 0 },
  { frequency: 1175, at: 0.08 },
];
const CUE_SECONDS = 0.3;

export type Sound = {
  setVolume: (percent: number) => void;
  chime: () => void;
  cue: () => void;
  devices: () => Promise<{ outputs: Output[]; microphone: boolean }>;
  select: (id: string) => Promise<void>;
};

export const silent: Sound = {
  setVolume: () => {},
  chime: () => {},
  cue: () => {},
  devices: async () => ({ outputs: [], microphone: false }),
  select: async () => {},
};

// wpctl's status lists devices like " │  *   53. Built-in Audio Stereo [vol: 0.40]".
function listed(status: string, heading: string): Output[] {
  const audio = status.slice(status.indexOf("Audio"));
  const start = audio.indexOf(heading);
  if (start < 0) return [];
  const rest = audio.slice(start + heading.length);
  const end = rest.search(/[├└]─/);
  return [...rest.slice(0, end < 0 ? undefined : end).matchAll(/(\*?)\s+(\d+)\.\s+(.+?)(?:\s+\[vol:.*)?$/gm)].map(
    ([, star, id, name]) => ({ id, name: name.trim(), selected: star === "*" }),
  );
}

export const parseOutputs = (status: string) => listed(status, "Sinks:");
export const parseInputs = (status: string) => listed(status, "Sources:");

// A little WAV file, written out rather than kept in the repository as a binary.
function tones(notes: { frequency: number; at: number }[], seconds: number): Buffer {
  const samples = Math.floor(SAMPLE_RATE * seconds);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / SAMPLE_RATE;
    let level = 0;
    for (const { frequency, at } of notes) {
      if (time >= at) level += Math.sin(2 * Math.PI * frequency * (time - at)) * Math.exp(-6 * (time - at));
    }
    wav.writeInt16LE(Math.round((level / notes.length) * 28_000), 44 + i * 2);
  }
  return wav;
}

export const chimeWav = () => tones(NOTES, CHIME_SECONDS);
export const cueWav = () => tones(CUE_NOTES, CUE_SECONDS);

export function createSound(state: string): Sound {
  const directory = join(state, "sounds");
  const chimeFile = join(directory, "chime.wav");
  const cueFile = join(directory, "cue.wav");
  mkdirSync(directory, { recursive: true });
  writeFileSync(chimeFile, chimeWav());
  writeFileSync(cueFile, cueWav());
  const quietly = (error: unknown) => console.error("Sound:", error instanceof Error ? error.message : error);
  return {
    setVolume(percent) {
      run("wpctl", ["set-volume", SINK, `${percent}%`]).catch(quietly);
    },
    chime() {
      spawn("pw-play", [chimeFile], { stdio: "ignore" }).on("error", quietly);
    },
    cue() {
      spawn("pw-play", [cueFile], { stdio: "ignore" }).on("error", quietly);
    },
    async devices() {
      try {
        const { stdout } = await run("wpctl", ["status"]);
        return { outputs: parseOutputs(stdout), microphone: parseInputs(stdout).length > 0 };
      } catch {
        return { outputs: [], microphone: false };
      }
    },
    async select(id) {
      if (/^\d+$/.test(id)) await run("wpctl", ["set-default", id]).catch(quietly);
    },
  };
}
