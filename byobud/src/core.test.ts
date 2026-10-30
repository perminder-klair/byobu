import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Core } from "./core.ts";
import type { Update } from "./protocol.ts";

// A plugin on disk, as byobud would find one.
function pluginFolder(root: string, id: string, source: string, manifest: object = {}) {
  const directory = join(root, id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ schemaVersion: 1, id, name: id, version: "1", description: "", enabledByDefault: true, ...manifest }));
  writeFileSync(join(directory, "index.mjs"), source);
}

const TILE = `{ id: "a", name: "A", icon: "", tone: "accent", active: false, detail: "off" }`;

function setUp() {
  const root = mkdtempSync(join(tmpdir(), "byobud-"));
  const core = new Core(join(root, "state"));
  const updates: Update[] = [];
  core.subscribe((update) => updates.push(update));
  return { root, core, updates, data: () => updates.filter(({ type }) => type === "data") };
}

test("sends only what changed, however often a plugin publishes everything", async () => {
  const { root, core, data } = setUp();
  pluginFolder(root, "one", `export default (host) => {
    const tile = ${TILE};
    host.publish({ tiles: [tile], rooms: ["Kitchen"] });
    host.publish({ tiles: [tile], rooms: ["Kitchen"] });
    host.publish({ tiles: [{ ...tile, detail: "on" }], rooms: ["Kitchen"] });
    return {};
  };`);
  await core.start([root]);
  assert.deepEqual(data().map((update) => update.type === "data" && [update.key, update.id]), [["tiles", "a"], ["rooms", undefined], ["tiles", "a"]]);
  assert.equal(core.snapshot().data.one.tiles?.a.detail, "on");
  await core.stop();
});

test("tells clients when an item goes", async () => {
  const { root, core, data } = setUp();
  pluginFolder(root, "one", `export default (host) => { host.publish({ tiles: [${TILE}] }); host.publish({ tiles: [] }); return {}; };`);
  await core.start([root]);
  const last = data().at(-1);
  assert.ok(last?.type === "data" && last.id === "a" && last.value === undefined);
  await core.stop();
});

test("one plugin failing leaves the others running", async () => {
  const { root, core } = setUp();
  pluginFolder(root, "bad", `export default () => { throw new Error("nope"); };`);
  pluginFolder(root, "good", `export default (host) => { host.status("ok"); return {}; };`);
  await core.start([root]);
  const states = Object.fromEntries(core.summaries().map(({ id, status }) => [id, status.state]));
  assert.deepEqual(states, { bad: "error", good: "ok" });
  await core.stop();
});

test("a plugin's secret isn't in anything a client gets", async () => {
  const { root, core, updates } = setUp();
  const schema = [{ key: "token", type: "secret", label: "Token" }];
  pluginFolder(root, "one", `export default (host) => { host.status("ok"); return {}; };`, { schema });
  await core.start([root]);
  await core.updatePlugin("one", { values: { token: "hunter2" } });
  assert.ok(!JSON.stringify(core.snapshot()).includes("hunter2"));
  assert.ok(!JSON.stringify(updates).includes("hunter2"));
  await core.stop();
});

test("turning a plugin off takes its data with it, and a late publish is ignored", async () => {
  const { root, core } = setUp();
  pluginFolder(root, "one", `export default (host) => { globalThis.lateHost = host; host.publish({ tiles: [${TILE}] }); return {}; };`);
  await core.start([root]);
  assert.ok(core.snapshot().data.one);
  await core.updatePlugin("one", { enabled: false });
  assert.equal(core.snapshot().data.one, undefined);
  (globalThis as { lateHost?: { publish: (data: object) => void } }).lateHost?.publish({ rooms: ["Late"] });
  assert.equal(core.snapshot().data.one, undefined);
  await core.stop();
});

test("a plugin with a bad manifest is skipped", async () => {
  const { root, core } = setUp();
  mkdirSync(join(root, "broken"));
  writeFileSync(join(root, "broken", "manifest.json"), "{");
  pluginFolder(root, "fine", `export default () => ({});`);
  await core.start([root]);
  assert.deepEqual(core.summaries().map(({ id }) => id), ["fine"]);
  await core.stop();
});

test("the volume is applied once there's something to apply it to", async () => {
  const volumes: number[] = [];
  let outputs: { id: string; name: string; selected: boolean }[] = [];
  const root = mkdtempSync(join(tmpdir(), "byobud-"));
  const core = new Core(join(root, "state"), {
    setVolume: (percent) => volumes.push(percent),
    chime: () => {},
    cue: () => {},
    devices: async () => ({ outputs, microphone: false }),
    select: async () => {},
  });
  await core.start([root]);
  assert.deepEqual(volumes, [], "nothing to set it on yet");
  outputs = [{ id: "1", name: "Speaker", selected: true }];
  await core.selectOutput("1");
  assert.deepEqual(volumes, [50]);
  await core.stop();
});
