import assert from "node:assert/strict";
import { test } from "node:test";
import { SECRET_SET, type SettingField } from "./protocol.ts";
import { applyValues, redact, withDefaults } from "./settings.ts";

const schema: SettingField[] = [
  { key: "url", type: "url", label: "Address", defaultValue: "" },
  { key: "token", type: "secret", label: "Token" },
  { key: "on", type: "boolean", label: "On", defaultValue: true },
  { key: "size", type: "number", label: "Size", min: 1, max: 10 },
  { key: "mode", type: "select", label: "Mode", options: [{ value: "a", label: "A" }] },
];

test("a secret never reaches a client, only whether it's set", () => {
  assert.equal(redact(schema, { token: "hunter2" }).token, SECRET_SET);
  assert.equal(redact(schema, {}).token, "");
  assert.ok(!JSON.stringify(redact(schema, { token: "hunter2", url: "x" })).includes("hunter2"));
});

test("a secret sent back as shown keeps its value, and a new one replaces it", () => {
  assert.equal(applyValues(schema, { token: "old" }, { token: SECRET_SET }).token, "old");
  assert.equal(applyValues(schema, { token: "old" }, { token: "new" }).token, "new");
});

test("takes only declared fields, in their declared types", () => {
  const values = applyValues(schema, {}, { nonsense: 1, on: 0, size: 99, mode: "b" });
  assert.deepEqual(values, { on: false, size: 10 });
});

test("defaults fill in what isn't saved", () => {
  assert.deepEqual(withDefaults(schema, { url: "x" }), { url: "x", on: true });
});
