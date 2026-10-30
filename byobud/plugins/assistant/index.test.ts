// The assistant end to end through the real SDK, against a stand-in for the Messages API that
// plays back a script of responses, in the same streaming format.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { Host } from "../../src/plugin.ts";
import type { Action, Conversation, PluginData, Snapshot, Tile } from "../../src/protocol.ts";
import plugin from "./index.ts";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: object };
type Reply = { content: Block[]; stop_reason: string } | { status: number; body: object };

let script: Reply[] = [];
let requests: { body: Record<string, unknown>; headers: Record<string, unknown> }[] = [];
let server: Server;

function sse({ content, stop_reason }: { content: Block[]; stop_reason: string }): string {
  const events: [string, object][] = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
  ];
  content.forEach((block, index) => {
    if (block.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }]);
    } else {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      requests.push({ body: JSON.parse(raw), headers: req.headers });
      const reply = script.shift() ?? { content: [{ type: "text", text: "Out of script." }], stop_reason: "end_turn" };
      if ("status" in reply) {
        res.writeHead(reply.status, { "Content-Type": "application/json" }).end(JSON.stringify(reply.body));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" }).end(sse(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  delete process.env.ANTHROPIC_BASE_URL;
});

const lamp: Tile = { id: "light.a", name: "Lamp", icon: "", tone: "yellow", active: true, detail: "On", tap: { id: "toggle" } };
const door: Tile = {
  id: "lock.a",
  name: "Front door",
  icon: "",
  tone: "red",
  active: false,
  detail: "Locked",
  sheet: { sections: [{ type: "buttons", buttons: [{ icon: "", label: "Unlock", sensitive: true, action: { id: "unlock" } }] }] },
};

async function setUp(settings: object = {}) {
  script = [];
  requests = [];
  const performed: { plugin: string; action: Action; value?: unknown }[] = [];
  const shown: string[] = [];
  let conversation: Conversation = { busy: false, turns: [] };
  const statuses: unknown[] = [];
  const host = {
    settings: { apiKey: "test-key", model: "claude-opus-5-5", ...settings },
    publish: (data: PluginData) => {
      if (data.conversation) conversation = data.conversation;
    },
    status: (...args: unknown[]) => statuses.push(args),
    log: () => {},
    world: () => ({ data: { ha: { tiles: { "light.a": lamp, "lock.a": door } } } }) as unknown as Snapshot,
    perform: async (plugin: string, action: Action, value?: unknown) => {
      performed.push({ plugin, action, value });
    },
    showFace: (face: string) => shown.push(face),
  } as unknown as Host;
  const instance = await plugin(host);
  return { instance, performed, shown, statuses, conversation: () => conversation, answer: () => conversation.turns.at(-1) };
}

const call = (id: string, name: string, input: object): Block => ({ type: "tool_use", id, name, input });
const say = (text: string): Reply => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

test("does what's asked, and shows the tile it touched", async () => {
  const { instance, performed, answer } = await setUp();
  script = [{ content: [call("t1", "control_device", { ref: "ha/light.a", control: "Toggle" })], stop_reason: "tool_use" }, say("Done.")];
  await instance.act?.("ask", undefined, "turn off the lamp");
  assert.deepEqual(performed, [{ plugin: "ha", action: { id: "toggle" }, value: undefined }]);
  assert.equal(answer()?.text, "Done.");
  assert.deepEqual(answer()?.tiles, [{ plugin: "ha", id: "light.a" }]);
});

test("the model can't unlock a door: it takes a person, and only once", async () => {
  const { instance, performed, answer } = await setUp();
  script = [{ content: [call("t1", "control_device", { ref: "ha/lock.a", control: "Unlock" })], stop_reason: "tool_use" }, say("Press Confirm to unlock.")];
  await instance.act?.("ask", undefined, "open the front door");
  assert.deepEqual(performed, [], "nothing happened yet");
  const [confirm] = answer()?.confirm ?? [];
  assert.match(confirm.label, /Unlock: Front door/);
  const toolResult = JSON.stringify(requests[1].body.messages);
  assert.match(toolResult, /Not done yet/);
  await instance.act?.("confirm", confirm.action.data, undefined);
  assert.deepEqual(performed, [{ plugin: "ha", action: { id: "unlock" }, value: undefined }]);
  await instance.act?.("confirm", confirm.action.data, undefined);
  assert.equal(performed.length, 1, "a second press does nothing");
  assert.deepEqual(answer()?.confirm, [], "the button goes once used");
});

test("a made-up confirmation does nothing", async () => {
  const { instance, performed } = await setUp();
  await instance.act?.("confirm", { pending: "nope" }, undefined);
  assert.deepEqual(performed, []);
});

test("sends the settings the API expects, and caches", async () => {
  const { instance } = await setUp();
  script = [say("Hello.")];
  await instance.act?.("ask", undefined, "hi");
  const { body, headers } = requests[0];
  assert.equal(body.model, "claude-opus-5-5");
  assert.deepEqual(body.cache_control, { type: "ephemeral" });
  assert.deepEqual(body.output_config, { effort: "low" });
  assert.equal(body.fallbacks, "default");
  assert.match(String(headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
  assert.ok(!String(body.system).includes(String(new Date().getFullYear())), "the system prompt has no date, so it can be cached");
});

test("Haiku has no fallback route, so doesn't ask for one", async () => {
  const { instance } = await setUp({ model: "claude-haiku-5-5" });
  script = [say("Hello.")];
  await instance.act?.("ask", undefined, "hi");
  assert.equal(requests[0].body.fallbacks, undefined);
});

test("a refusal is said plainly and nothing runs", async () => {
  const { instance, performed, answer } = await setUp();
  script = [{ content: [call("t1", "control_device", { ref: "ha/light.a", control: "Toggle" })], stop_reason: "refusal" }];
  await instance.act?.("ask", undefined, "something");
  assert.deepEqual(performed, []);
  assert.equal(answer()?.text, "I can't help with that one.");
});

test("a tool call cut off by the token limit isn't run", async () => {
  const { instance, performed } = await setUp();
  script = [{ content: [call("t1", "control_device", { ref: "ha/light.a", control: "Toggle" })], stop_reason: "max_tokens" }, say("Sorry.")];
  await instance.act?.("ask", undefined, "lamp");
  assert.deepEqual(performed, []);
});

test("a bad API key says so, here and in Settings", async () => {
  const { instance, answer, statuses } = await setUp();
  script = [{ status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }];
  await instance.act?.("ask", undefined, "hi");
  assert.match(answer()?.text ?? "", /didn't accept the API key/);
  assert.ok(statuses.some((status) => JSON.stringify(status).includes("API key")));
});

test("the loop has an end, however keen the model is", async () => {
  const { instance, answer } = await setUp();
  script = Array.from({ length: 20 }, (_, i) => ({ content: [call(`t${i}`, "find_devices", {})], stop_reason: "tool_use" }));
  await instance.act?.("ask", undefined, "loop");
  assert.ok(requests.length <= 8, `${requests.length} requests`);
  assert.ok(answer()?.text);
});

test("starts timers and shows faces through the host", async () => {
  const { instance, performed, shown } = await setUp();
  script = [
    { content: [call("t1", "start_timer", { minutes: 8, label: "pasta" }), call("t2", "show_on_panel", { face: "clock" })], stop_reason: "tool_use" },
    say("Eight minutes, starting now."),
  ];
  await instance.act?.("ask", undefined, "8 minute pasta timer");
  assert.deepEqual(performed, [{ plugin: "timers", action: { id: "start", data: { seconds: 480, label: "pasta" } }, value: undefined }]);
  assert.deepEqual(shown, ["clock"]);
});

test("nonsense from the model goes back as an error, not a crash", async () => {
  const { instance, performed } = await setUp();
  script = [{ content: [call("t1", "control_device", { ref: 7 }), call("t2", "start_timer", { minutes: -1 }), call("t3", "nope", {})], stop_reason: "tool_use" }, say("Sorry.")];
  await instance.act?.("ask", undefined, "x");
  assert.deepEqual(performed, []);
  assert.match(JSON.stringify(requests[1].body.messages), /needs a ref[\s\S]*above 0[\s\S]*no tool called nope/);
});

test("without a key it stays out of the way", async () => {
  const { statuses } = await setUp({ apiKey: "" });
  assert.deepEqual(statuses[0], ["off", "Needs an API key"]);
});
