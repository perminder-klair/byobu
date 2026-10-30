import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { speak, transcribe } from "./voice.ts";

async function withServer(status: number, reply: string, run: (url: string, seen: () => { url?: string; auth?: string; body: string }) => Promise<void>) {
  let seen: { url?: string; auth?: string; body: string } = { body: "" };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen = { url: req.url, auth: req.headers.authorization, body };
      res.writeHead(status).end(reply);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`, () => seen);
  } finally {
    server.close();
  }
}

const directory = mkdtempSync(join(tmpdir(), "voice-"));
const clip = join(directory, "clip.wav");
writeFileSync(clip, "RIFFaudio");
const speech = (url: string) => ({ url, key: "secret", listenModel: "whisper-1", speakModel: "tts-1", voice: "alloy", directory });

test("sends the recording and returns the words", async () => {
  await withServer(200, '{"text":"turn off the lamp"}', async (url, seen) => {
    assert.equal(await transcribe(speech(url), clip), "turn off the lamp");
    assert.equal(seen().url, "/v1/audio/transcriptions");
    assert.equal(seen().auth, "Bearer secret");
    assert.match(seen().body, /whisper-1[\s\S]*RIFFaudio/);
  });
});

test("a failing server is an error, not silence", async () => {
  await withServer(500, "no", async (url) => {
    await assert.rejects(transcribe(speech(url), clip), /answered 500/);
  });
});

test("asks for the reply as a WAV and saves it", async () => {
  await withServer(200, "RIFFreply", async (url, seen) => {
    await speak(speech(url), "Done.");
    assert.equal(seen().url, "/v1/audio/speech");
    assert.deepEqual(JSON.parse(seen().body), { model: "tts-1", voice: "alloy", input: "Done.", response_format: "wav" });
    assert.equal(readFileSync(join(directory, "reply.wav"), "utf8"), "RIFFreply");
  });
});
