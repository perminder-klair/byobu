import assert from "node:assert/strict";
import { test } from "node:test";
import { startEars, type Hearing } from "./ears.ts";

// Stands in for listen.py.
const listener = `
process.stdout.write('{"ready":true}\\nsomething that isn\\'t JSON\\n');
process.stdin.on("data", (data) => {
  if (String(data).includes("listen")) process.stdout.write('{"heard":"turn it off"}\\n');
  if (String(data).includes("hold")) process.exit(1);
});
setInterval(() => {}, 1000);
`;

function ears() {
  const heard: Hearing[] = [];
  const logged: string[] = [];
  let lost = 0;
  const handle = startEars(process.execPath, ["-e", listener], (hearing) => heard.push(hearing), () => lost++, (...args) => logged.push(args.join(" ")));
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(check(), "timed out");
  };
  return { handle, heard, logged, lost: () => lost, until };
}

test("passes on what it hears and answers it", async () => {
  const { handle, heard, logged, until } = ears();
  await until(() => heard.length > 0);
  assert.deepEqual(heard, [{ ready: true }]);
  handle.tell("listen");
  await until(() => heard.length > 1);
  assert.deepEqual(heard[1], { heard: "turn it off" });
  assert.match(logged.join(), /isn't JSON/);
  handle.stop();
});

test("says so when it's lost, and stopping isn't losing it", async () => {
  const first = ears();
  await first.until(() => first.heard.length > 0);
  first.handle.tell("hold");
  await first.until(() => first.lost() === 1);
  first.handle.stop();

  const second = ears();
  await second.until(() => second.heard.length > 0);
  second.handle.stop();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(second.lost(), 0);
});

test("a listener that can't start is logged, not thrown", async () => {
  const logged: string[] = [];
  const handle = startEars("/nonexistent/python", [], () => {}, () => {}, (...args) => logged.push(args.join(" ")));
  for (let i = 0; i < 100 && logged.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(logged.join(), /Can't start listening/);
  handle.stop();
});
