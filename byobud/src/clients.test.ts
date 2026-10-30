import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Clients } from "./clients.ts";

const fresh = () => {
  const state = mkdtempSync(join(tmpdir(), "clients-"));
  return { state, clients: new Clients(state) };
};

test("a code pairs once, and the token it gives works", () => {
  const { clients } = fresh();
  const { code } = clients.startPairing();
  const token = clients.pair(code, "Phone");
  assert.ok(token);
  assert.ok(clients.has(token));
  assert.equal(clients.pair(code, "Other"), undefined);
});

test("a wrong code or an expired one gets nothing", () => {
  const { clients } = fresh();
  const { code, expires } = clients.startPairing(0);
  assert.equal(clients.pair("wrong", "Phone", 1), undefined);
  assert.equal(clients.pair(code, "Phone", expires + 1), undefined);
});

test("with no pairing started, nothing pairs", () => {
  assert.equal(fresh().clients.pair("", "Phone"), undefined);
});

test("guessing is cut off, even for the right code", () => {
  const { clients } = fresh();
  const { code } = clients.startPairing(0);
  for (let i = 0; i < 10; i++) clients.pair("wrong", "x", 1);
  assert.equal(clients.pair(code, "Phone", 2), undefined);
  // A minute later the limit has passed, and the code still works.
  assert.ok(clients.pair(code, "Phone", 70_000));
});

test("tokens aren't stored, only their hashes", () => {
  const { state, clients } = fresh();
  const token = clients.pair(clients.startPairing().code, "Phone");
  assert.ok(token && !readFileSync(join(state, "clients.json"), "utf8").includes(token));
});

test("a client survives a restart, and removing one locks it out", () => {
  const { state, clients } = fresh();
  const token = clients.pair(clients.startPairing().code, "Phone");
  const again = new Clients(state);
  assert.ok(again.has(token));
  again.remove(again.list()[0].id);
  assert.equal(again.has(token), false);
  assert.equal(new Clients(state).has(token), false);
});

test("an unknown token doesn't pass", () => {
  const { clients } = fresh();
  assert.equal(clients.has("nope"), false);
  assert.equal(clients.has(undefined), false);
});
