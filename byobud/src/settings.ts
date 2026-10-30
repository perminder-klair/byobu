// Settings on disk: panel.json and one file per plugin. Written with a rename, so a power cut
// leaves the old file or the new one rather than half of either.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SECRET_SET, type PanelSettings, type SettingField } from "./protocol.ts";

export type Values = Record<string, string | number | boolean>;

export const PANEL_DEFAULTS: PanelSettings = {
  brightness: 50,
  volume: 50,
  night: "auto",
  blankAfter: 30,
  theme: "",
  faces: ["modular", "clock", "weather", "music", "cameras"],
  modular: { main: "", tiles: [] },
};

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.new`;
  // Plugin settings can hold tokens.
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function loadPanel(state: string): PanelSettings {
  return { ...PANEL_DEFAULTS, ...readJson(join(state, "panel.json"), {}) };
}

export function savePanel(state: string, panel: PanelSettings) {
  writeJson(join(state, "panel.json"), panel);
}

export type PluginRecord = { enabled?: boolean; values: Values; stored?: unknown };

export function loadPlugin(state: string, id: string): PluginRecord {
  return { values: {}, ...readJson(join(state, "plugins", `${id}.json`), {}) };
}

export function savePlugin(state: string, id: string, record: PluginRecord) {
  writeJson(join(state, "plugins", `${id}.json`), record);
}

// What a plugin sees: its saved values over the manifest's defaults.
export function withDefaults(schema: SettingField[], values: Values): Values {
  const merged: Values = {};
  for (const { key, defaultValue } of schema) if (defaultValue !== undefined) merged[key] = defaultValue;
  return { ...merged, ...values };
}

// What a client sees: secrets never leave this process, only whether they're set.
export function redact(schema: SettingField[], values: Values): Values {
  const safe = { ...values };
  for (const { key, type } of schema) {
    if (type === "secret") safe[key] = values[key] ? SECRET_SET : "";
  }
  return safe;
}

// Takes what a client sent: only fields the plugin declared, in their declared type, and a
// secret left showing SECRET_SET keeps its old value.
export function applyValues(schema: SettingField[], current: Values, sent: Record<string, unknown>): Values {
  const next = { ...current };
  for (const field of schema) {
    const value = sent[field.key];
    if (value === undefined) continue;
    if (field.type === "secret" && value === SECRET_SET) continue;
    if (field.type === "boolean") next[field.key] = Boolean(value);
    else if (field.type === "number") {
      const number = Number(value);
      if (Number.isFinite(number)) next[field.key] = Math.min(field.max, Math.max(field.min, number));
    } else if (field.type === "select") {
      if (field.options.some((option) => option.value === value)) next[field.key] = String(value);
    } else next[field.key] = String(value);
  }
  return next;
}
