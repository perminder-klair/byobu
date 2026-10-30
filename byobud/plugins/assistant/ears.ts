// Runs listen.py, which holds the microphone, and passes on what it hears. It's a process of its
// own and kept going like the receivers, as losing it shouldn't take everything else down.
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

const FIRST_RESTART_MS = 5000;
// A panel without what it needs would otherwise spend its time starting Python.
const LAST_RESTART_MS = 60_000;

export type Hearing = { ready: true } | { wake: true } | { heard: string } | { clip: string } | { nothing: true };
export type Ears = { tell: (command: "listen" | "hold" | "release") => void; stop: () => void };

export function startEars(command: string, args: string[], onHearing: (hearing: Hearing) => void, onLost: () => void, log: (...args: unknown[]) => void): Ears {
  let child: ChildProcess | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let wait = FIRST_RESTART_MS;

  function start() {
    const current = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    child = current;
    current.stdin.on("error", () => {});
    createInterface({ input: current.stdout }).on("line", (line) => {
      let hearing: Hearing;
      try {
        hearing = JSON.parse(line);
      } catch {
        log(`listen: ${line}`);
        return;
      }
      if ("ready" in hearing) wait = FIRST_RESTART_MS;
      onHearing(hearing);
    });
    createInterface({ input: current.stderr }).on("line", (line) => log(`listen: ${line}`));
    current.on("error", (error) => log("Can't start listening:", error.message));
    current.on("close", () => {
      child = undefined;
      if (stopped) return;
      onLost();
      timer = setTimeout(start, wait);
      wait = Math.min(wait * 2, LAST_RESTART_MS);
    });
  }

  start();
  return {
    tell(word) {
      child?.stdin?.write(`${word}\n`);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      child?.kill();
    },
  };
}
