import assert from "node:assert/strict";
import { test } from "node:test";
import plugin, { label, presets, settle, timerView, type Stored } from "./index.ts";
import type { Host } from "../../src/plugin.ts";
import type { PluginData } from "../../src/protocol.ts";

test("reads durations", () => {
  assert.equal(label(60), "1 min");
  assert.equal(label(3600), "1 h");
  assert.equal(label(90), "90 s");
});

test("presets start timers from a tap", () => {
  const [first] = presets();
  assert.equal(first.kind, "timer");
  assert.deepEqual(first.tap, { id: "start", data: { seconds: 60 } });
});

test("a timer that ended moves to the ones ringing", () => {
  const stored: Stored = { running: [{ id: "a", label: "5 min", seconds: 300, endsAt: 1000 }, { id: "b", label: "10 min", seconds: 600, endsAt: 9000 }], rung: [] };
  const { running, rung } = settle(stored, 2000);
  assert.deepEqual(running.map(({ id }) => id), ["b"]);
  assert.deepEqual(rung, [{ id: "a", label: "5 min", endedAt: 1000 }]);
});

test("timer times are absolute", () => {
  assert.equal(timerView({ id: "a", label: "x", seconds: 1, endsAt: 0 }).endsAt, "1970-01-01T00:00:00.000Z");
});

function fakeHost(stored?: unknown) {
  const published: PluginData = {};
  let chimes = 0;
  let saved = stored;
  const host = {
    settings: {},
    publish: (data: PluginData) => Object.assign(published, data),
    status: () => {},
    log: () => {},
    directory: "",
    stored,
    store: (value: unknown) => {
      saved = value;
    },
    chime: () => chimes++,
    pictureUrl: (path: string) => path,
  } as unknown as Host;
  return { host, published, chimes: () => chimes, saved: () => saved };
}

test("a timer that ended while byobud was down still rings when it comes back", async () => {
  const { host, published, chimes } = fakeHost({ running: [{ id: "a", label: "5 min", seconds: 300, endsAt: Date.now() - 5000 }], rung: [] });
  const instance = await plugin(host);
  assert.equal(published.alerts?.length, 1);
  assert.equal(chimes(), 1);
  await instance.stop?.();
});

test("starting, cancelling and dismissing", async () => {
  const { host, published, saved } = fakeHost();
  const instance = await plugin(host);
  await instance.act?.("start", { seconds: 60 }, undefined);
  assert.equal(published.timers?.length, 1);
  assert.equal((saved() as Stored).running.length, 1);
  const id = published.timers?.[0].id;
  await instance.act?.("add", { id, seconds: 60 }, undefined);
  assert.ok(Date.parse(published.timers?.[0].endsAt ?? "") > Date.now() + 100_000);
  await instance.act?.("cancel", { id }, undefined);
  assert.equal(published.timers?.length, 0);
  await instance.stop?.();
});
