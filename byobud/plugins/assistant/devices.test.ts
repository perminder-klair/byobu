import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snapshot, Tile } from "../../src/protocol.ts";
import { devices, findTile, resolveControl, statusOf } from "./devices.ts";

const lamp: Tile = {
  id: "light.a",
  name: "Lamp",
  room: "Kitchen",
  icon: "",
  tone: "yellow",
  active: true,
  detail: "50%",
  tap: { id: "call" },
  sheet: {
    sections: [
      { type: "slider", label: "Brightness", min: 0, max: 100, action: { id: "brightness" } },
      { type: "choices", label: "Effect", options: [{ value: "rainbow", label: "Rainbow" }], action: { id: "effect" } },
    ],
  },
};
const lock: Tile = {
  id: "lock.a",
  name: "Front door",
  icon: "",
  tone: "red",
  active: false,
  detail: "Locked",
  sheet: {
    sections: [
      {
        type: "buttons",
        buttons: [
          { icon: "", label: "Lock", action: { id: "lock" } },
          { icon: "", label: "Unlock", sensitive: true, action: { id: "unlock" } },
        ],
      },
    ],
  },
};
const world = {
  data: { ha: { tiles: { "light.a": lamp, "lock.a": lock, "summary.x": { ...lamp, id: "summary.x", kind: "summary" } }, agenda: [{ id: "1", start: "2026-11-01", summary: "Bins" }] } },
} as unknown as Snapshot;

test("lists devices with their controls, leaving out summaries", () => {
  const list = devices(world);
  assert.deepEqual(list.map(({ ref }) => ref), ["ha/light.a", "ha/lock.a"]);
  assert.deepEqual(list[0].controls.map(({ name }) => name), ["Toggle", "Brightness", "Effect"]);
  assert.ok(!JSON.stringify(list).includes("brightness\""), "actions stay out of what the model sees");
});

test("a sensitive control is marked as needing confirmation", () => {
  const [, front] = devices(world);
  assert.equal(front.controls.find(({ name }) => name === "Unlock")?.needsConfirmation, true);
  const resolved = resolveControl(lock, "unlock");
  assert.ok(typeof resolved !== "string" && resolved.sensitive);
  const locking = resolveControl(lock, "Lock");
  assert.ok(typeof locking !== "string" && !locking.sensitive);
});

test("numbers are checked against the control's range", () => {
  assert.equal(typeof resolveControl(lamp, "Brightness", 500), "string");
  assert.equal(typeof resolveControl(lamp, "Brightness", "lots"), "string");
  assert.equal(typeof resolveControl(lamp, "Brightness"), "string");
  const ok = resolveControl(lamp, "brightness", 40);
  assert.ok(typeof ok !== "string" && ok.value === 40);
});

test("choices are matched by name and checked", () => {
  const ok = resolveControl(lamp, "Effect", "rainbow");
  assert.ok(typeof ok !== "string" && ok.value === "rainbow");
  assert.equal(typeof resolveControl(lamp, "Effect", "strobe"), "string");
});

test("an unknown control says what there is", () => {
  assert.match(String(resolveControl(lamp, "Volume")), /Toggle, Brightness, Effect/);
});

test("finds a tile by reference, ids with dots included", () => {
  assert.equal(findTile(world, "ha/light.a")?.tile.name, "Lamp");
  assert.equal(findTile(world, "ha/nope"), undefined);
  assert.equal(findTile(world, "nope"), undefined);
});

test("looks up the agenda", () => {
  assert.deepEqual(statusOf(world, "agenda"), [{ id: "1", start: "2026-11-01", summary: "Bins" }]);
});
