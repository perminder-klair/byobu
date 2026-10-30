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

export type Sound = {
  setVolume: (percent: number) => void;
  chime: () => void;
  outputs: () => Promise<Output[]>;
  select: (id: string) => Promise<void>;
};

export const silent: Sound = { setVolume: () => {}, chime: () => {}, outputs: async () => [], select: async () => {} };

// wpctl's status lists sinks like " │  *   53. Built-in Audio Stereo [vol: 0.40]".
export function parseOutputs(status: string): Output[] {
  const audio = status.slice(status.indexOf("Audio"));
  const start = audio.indexOf("Sinks:");
  if (start < 0) return [];
  const end = audio.indexOf("Sources:", start);
  return [...audio.slice(start, end < 0 ? undefined : end).matchAll(/(\*?)\s+(\d+)\.\s+(.+?)(?:\s+\[vol:.*)?$/gm)].map(
    ([, star, id, name]) => ({ id, name: name.trim(), selected: star === "*" }),
  );
}

// A little WAV file, written out rather than kept in the repository as a binary.
export function chimeWav(): Buffer {
  const samples = Math.floor(SAMPLE_RATE * CHIME_SECONDS);
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
    for (const { frequency, at } of NOTES) {
      if (time >= at) level += Math.sin(2 * Math.PI * frequency * (time - at)) * Math.exp(-6 * (time - at));
    }
    wav.writeInt16LE(Math.round((level / NOTES.length) * 28_000), 44 + i * 2);
  }
  return wav;
}

export function createSound(state: string): Sound {
  const directory = join(state, "sounds");
  const chimeFile = join(directory, "chime.wav");
  mkdirSync(directory, { recursive: true });
  writeFileSync(chimeFile, chimeWav());
  const quietly = (error: unknown) => console.error("Sound:", error instanceof Error ? error.message : error);
  return {
    setVolume(percent) {
      run("wpctl", ["set-volume", SINK, `${percent}%`]).catch(quietly);
    },
    chime() {
      spawn("pw-play", [chimeFile], { stdio: "ignore" }).on("error", quietly);
    },
    async outputs() {
      try {
        return parseOutputs((await run("wpctl", ["status"])).stdout);
      } catch {
        return [];
      }
    },
    async select(id) {
      if (/^\d+$/.test(id)) await run("wpctl", ["set-default", id]).catch(quietly);
    },
  };
}
