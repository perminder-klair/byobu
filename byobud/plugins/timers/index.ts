// Kitchen timers. Times are absolute, so a timer survives byobud restarting, and one that ended
// while it was down still rings.
import { mdiBellRing, mdiClose, mdiPlus, mdiTimerOutline } from "@mdi/js";
import type { Plugin } from "../../src/plugin.ts";
import type { Alert, Tile, Timer } from "../../src/protocol.ts";

const PRESET_MINUTES = [1, 3, 5, 10, 15, 30, 45, 60];
const CHIME_EVERY_MS = 4000;
// A forgotten timer shouldn't chime in an empty house for ever.
const CHIME_FOR_MS = 2 * 60_000;

export type Running = { id: string; label: string; seconds: number; endsAt: number };
export type Rung = { id: string; label: string; endedAt: number };
export type Stored = { running: Running[]; rung: Rung[] };

export function label(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

export const presets = (): Tile[] =>
  PRESET_MINUTES.map((minutes) => ({
    id: `preset.${minutes}`,
    name: label(minutes * 60),
    icon: mdiTimerOutline,
    tone: "accent",
    active: false,
    detail: "Start",
    kind: "timer",
    tap: { id: "start", data: { seconds: minutes * 60 } },
  }));

export const timerView = ({ id, label: name, seconds, endsAt }: Running): Timer => ({
  id,
  label: name,
  seconds,
  endsAt: new Date(endsAt).toISOString(),
  actions: [
    { icon: mdiPlus, label: "1 min", action: { id: "add", data: { id, seconds: 60 } } },
    { icon: mdiClose, label: "Cancel", action: { id: "cancel", data: { id } } },
  ],
});

export const alertView = ({ id, label: name }: Rung): Alert => ({
  id,
  title: "Timer finished",
  detail: name,
  icon: mdiBellRing,
  tone: "accent",
  actions: [{ icon: mdiClose, label: "Dismiss", selected: true, action: { id: "dismiss", data: { id } } }],
});

// Moves whatever has ended from running to rung.
export function settle({ running, rung }: Stored, now: number): Stored {
  const ended = running.filter(({ endsAt }) => endsAt <= now);
  return {
    running: running.filter(({ endsAt }) => endsAt > now),
    rung: [...rung, ...ended.map(({ id, label: name, endsAt }) => ({ id, label: name, endedAt: endsAt }))],
  };
}

const plugin: Plugin = (host) => {
  let state: Stored = { running: [], rung: [], ...(host.stored as Partial<Stored> | undefined) };
  let nextEnd: ReturnType<typeof setTimeout> | undefined;
  let bell: ReturnType<typeof setInterval> | undefined;
  let counter = 0;

  function ring() {
    const now = Date.now();
    const fresh = state.rung.filter(({ endedAt }) => now - endedAt < CHIME_FOR_MS);
    if (fresh.length > 0) host.chime();
    else {
      clearInterval(bell);
      bell = undefined;
    }
  }

  function update() {
    state = settle(state, Date.now());
    host.store(state);
    host.publish({ tiles: presets(), timers: state.running.map(timerView), alerts: state.rung.map(alertView) });
    clearTimeout(nextEnd);
    const soonest = Math.min(...state.running.map(({ endsAt }) => endsAt));
    if (Number.isFinite(soonest)) nextEnd = setTimeout(update, Math.max(0, soonest - Date.now()));
    if (state.rung.length > 0 && !bell) {
      ring();
      bell = setInterval(ring, CHIME_EVERY_MS);
    }
    if (state.rung.length === 0 && bell) {
      clearInterval(bell);
      bell = undefined;
    }
  }

  update();
  host.status("ok");

  return {
    act(id, data) {
      const seconds = Number(data?.seconds);
      if (id === "start" && seconds > 0) {
        const timer = { id: `${Date.now()}-${++counter}`, label: String(data?.label ?? label(seconds)), seconds, endsAt: Date.now() + seconds * 1000 };
        state = { ...state, running: [...state.running, timer] };
      } else if (id === "add") {
        state = { ...state, running: state.running.map((timer) => (timer.id === data?.id ? { ...timer, endsAt: timer.endsAt + seconds * 1000 } : timer)) };
      } else if (id === "cancel") {
        state = { ...state, running: state.running.filter((timer) => timer.id !== data?.id) };
      } else if (id === "dismiss") {
        state = { ...state, rung: state.rung.filter((timer) => timer.id !== data?.id) };
      } else throw new Error(`Unknown action ${id}`);
      update();
    },
    stop() {
      clearTimeout(nextEnd);
      clearInterval(bell);
    },
  };
};

export default plugin;
