// Hold to talk: records from the panel's microphone, and uses a speech server for the words each
// way. Speech isn't something Claude does, so this is any server with OpenAI's audio API, which
// includes Whisper servers you can run yourself. The Pi is too slow to do it well alone.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_SECONDS = 20;

export type Speech = { url: string; key?: string; listenModel: string; speakModel?: string; voice: string; directory: string };
export type Recording = { stop: () => Promise<string> };

const headers = ({ key }: Speech) => (key ? { Authorization: `Bearer ${key}` } : undefined);
const endpoint = ({ url }: Speech, path: string) => `${url.replace(/\/+$/, "")}${path}`;

export function record(speech: Speech): Recording {
  const file = join(speech.directory, "heard.wav");
  const child = spawn("pw-record", ["--rate=16000", "--channels=1", "--format=s16", file], { stdio: "ignore" });
  // In case the finger never lifts.
  const limit = setTimeout(() => child.kill("SIGINT"), MAX_SECONDS * 1000);
  const finished = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return {
    async stop() {
      clearTimeout(limit);
      child.kill("SIGINT");
      await finished;
      return file;
    },
  };
}

export async function transcribe(speech: Speech, file: string): Promise<string> {
  const form = new FormData();
  form.set("model", speech.listenModel);
  form.set("file", new File([await readFile(file)], "heard.wav", { type: "audio/wav" }));
  const response = await fetch(endpoint(speech, "/audio/transcriptions"), { method: "POST", headers: headers(speech), body: form });
  if (!response.ok) throw new Error(`The speech server answered ${response.status}`);
  const { text } = (await response.json()) as { text: string };
  return text;
}

export async function speak(speech: Speech, text: string) {
  const response = await fetch(endpoint(speech, "/audio/speech"), {
    method: "POST",
    headers: { ...headers(speech), "Content-Type": "application/json" },
    body: JSON.stringify({ model: speech.speakModel, voice: speech.voice, input: text, response_format: "wav" }),
  });
  if (!response.ok) throw new Error(`The speech server answered ${response.status}`);
  const file = join(speech.directory, "reply.wav");
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  spawn("pw-play", [file], { stdio: "ignore" }).on("error", () => {});
}
