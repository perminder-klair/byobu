// What the screen does as a room goes quiet. It falls back to the far view of each face, then
// dims, then turns the backlight off. A tap brings it all back, and that tap is only a wake: it
// doesn't press whatever was under the finger. Swiping from the far view flips through the faces
// and stays far.
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { morph } from "./morph";
import { getStore, setBacklight, subscribe, type PanelSettings } from "./store";

export type PowerState = "near" | "far" | "dim" | "blank";
type Night = PanelSettings["night"];

export type Power = { state: PowerState; night: boolean };

const FAR_MS = 45_000;
const DIM_MS = 5 * 60_000;
const DIM_FACTOR = 0.3;
const NIGHT_BRIGHTNESS = 8;
const NIGHT_HOURS = { from: 22, to: 7 };
// Further than this and a touch was a swipe rather than a tap.
const TAP_SLOP = 12;
// Until byobud has answered.
const DEFAULTS = { brightness: 50, night: "auto", blankAfter: 30 } as const;

let power: Power = { state: "near", night: false };
let lastTouch = Date.now();
let close = true;
let pressedAt: { x: number; y: number } | undefined;
let swallowClick = false;
let backlight: number | undefined;
const listeners = new Set<() => void>();

function nightNow(setting: Night): boolean {
  if (setting !== "auto") return setting === "on";
  const hour = new Date().getHours();
  return hour >= NIGHT_HOURS.from || hour < NIGHT_HOURS.to;
}

function stateNow(blankAfter: number): PowerState {
  const idle = Date.now() - lastTouch;
  if (blankAfter > 0 && idle >= blankAfter * 60_000) return "blank";
  if (idle >= DIM_MS) return "dim";
  return close && idle < FAR_MS ? "near" : "far";
}

function updateBacklight(percent: number) {
  if (percent === backlight) return;
  backlight = percent;
  setBacklight(percent);
}

function notify() {
  for (const listener of listeners) listener();
}

function refresh() {
  const { brightness, night: nightMode, blankAfter } = getStore().snapshot?.panel ?? DEFAULTS;
  const state = stateNow(blankAfter);
  const night = nightNow(nightMode);
  if (state === "far") close = false;
  if (state !== power.state || night !== power.night) {
    // Nothing's on screen to morph coming back from blank.
    const morphing = power.state !== "blank" && (state === "near") !== (power.state === "near");
    power = { ...power, state, night };
    document.documentElement.toggleAttribute("data-night", night);
    if (morphing) morph(() => flushSync(notify));
    else notify();
  }
  const bright = night ? Math.min(NIGHT_BRIGHTNESS, brightness) : brightness;
  updateBacklight(state === "blank" ? 0 : Math.round(bright * (state === "dim" ? DIM_FACTOR : 1)));
}

// Brings the near view back, for anything that's as good as a tap.
export function wake() {
  close = true;
  lastTouch = Date.now();
  refresh();
}

export function startPower() {
  window.addEventListener(
    "pointerdown",
    (event) => {
      swallowClick = power.state !== "near";
      pressedAt = { x: event.clientX, y: event.clientY };
      if (power.state === "blank") {
        // Nothing can be seen to aim at on a blank screen, so the whole touch stops here.
        event.stopPropagation();
        pressedAt = undefined;
        wake();
      } else {
        lastTouch = Date.now();
        refresh();
      }
    },
    { capture: true },
  );
  window.addEventListener(
    "pointerup",
    (event) => {
      const tapped = pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) < TAP_SLOP;
      pressedAt = undefined;
      if (tapped) wake();
    },
    { capture: true },
  );
  // A swipe ends here rather than in pointerup, once the browser takes it over as a scroll.
  window.addEventListener(
    "pointercancel",
    () => {
      pressedAt = undefined;
      lastTouch = Date.now();
    },
    { capture: true },
  );
  window.addEventListener(
    "pointermove",
    () => {
      lastTouch = Date.now();
    },
    { capture: true },
  );
  window.addEventListener(
    "click",
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    { capture: true },
  );
  refresh();
  setInterval(refresh, 1000);
  // New settings from the panel sheet or a phone apply straight away.
  subscribe(refresh);
}

export function usePower(): Power {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => power,
  );
}
