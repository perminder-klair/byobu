// A speech server, for anyone who has one: anything with OpenAI's audio API, which includes Whisper
// servers you can run yourself. The panel can work out what's said by itself in listen.py, as a
// Pi 4 is quick enough, but it's a small model. Spoken replies do need a server.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Speech = { url: string; key?: string; listenModel: string; speakModel?: string; voice: string; directory: string };

const headers = ({ key }: Speech) => (key ? { Authorization: `Bearer ${key}` } : undefined);
const endpoint = ({ url }: Speech, path: string) => `${url.replace(/\/+$/, "")}${path}`;

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
  await new Promise<void>((resolve) => spawn("pw-play", [file], { stdio: "ignore" }).on("error", () => resolve()).on("close", () => resolve()));
}
