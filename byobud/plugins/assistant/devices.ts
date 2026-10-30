// What the assistant can see and do, worked out from what the shell would draw. A tile's sheet is
// already a list of its controls, so any plugin's devices work here with nothing extra.
import type { Action, PanelSettings, Section, Snapshot, Tile, TileRef } from "../../src/protocol.ts";

export type Control = {
  name: string;
  kind: "press" | "number" | "choice";
  min?: number;
  max?: number;
  options?: string[];
  needsConfirmation?: boolean;
};

// A control found on a tile, ready to send.
export type Resolved = { action: Action; value?: unknown; sensitive: boolean; label: string };

type Internal = Control & { action: Action; optionValue?: (name: string) => string | undefined };

function fromSection(section: Section): Internal[] {
  switch (section.type) {
    case "slider":
      return [{ name: section.label, kind: "number", min: section.min, max: section.max, action: section.action }];
    case "choices":
      return [
        {
          name: section.label,
          kind: "choice",
          options: section.options.map(({ label }) => label),
          action: section.action,
          optionValue: (name) => section.options.find(({ label, value }) => label.toLowerCase() === name.toLowerCase() || value === name)?.value,
        },
      ];
    case "buttons":
      return section.buttons.map(({ label, action, sensitive }) => ({ name: label, kind: "press", action, needsConfirmation: sensitive }));
    case "setpoints":
      return section.setpoints.map(({ label, min, max, action }) => ({ name: label, kind: "number", min, max, action }));
    case "media":
      return section.controls.map(({ label, action, sensitive }) => ({ name: label, kind: "press", action, needsConfirmation: sensitive }));
  }
}

function controlsFor(tile: Tile): Internal[] {
  const controls: Internal[] = [];
  if (tile.tap) controls.push({ name: "Toggle", kind: "press", action: tile.tap });
  if (tile.sheet?.power) controls.push({ name: "Power", kind: "press", action: tile.sheet.power.action });
  for (const section of tile.sheet?.sections ?? []) controls.push(...fromSection(section));
  return controls;
}

export type Device = { ref: string; name: string; room?: string; state: string; controls: Control[] };

export const refOf = ({ plugin, id }: TileRef) => `${plugin}/${id}`;

export function devices(world: Snapshot): Device[] {
  return Object.entries(world.data).flatMap(([plugin, data]) =>
    Object.values(data.tiles ?? {})
      .filter(({ kind, unavailable }) => (!kind || kind === "media" || kind === "scene") && !unavailable)
      .map((tile) => ({
        ref: refOf({ plugin, id: tile.id }),
        name: tile.name,
        room: tile.room,
        state: tile.detail,
        controls: controlsFor(tile).map(({ action: _action, optionValue: _optionValue, ...control }) => control),
      })),
  );
}

export function findTile(world: Snapshot, ref: string): (TileRef & { tile: Tile }) | undefined {
  const slash = ref.indexOf("/");
  const plugin = ref.slice(0, slash);
  const id = ref.slice(slash + 1);
  const tile = world.data[plugin]?.tiles?.[id];
  return tile && { plugin, id, tile };
}

// Finds a control by name and checks the value suits it. Returns why not, for the model to read.
export function resolveControl(tile: Tile, name: string, value?: unknown): Resolved | string {
  const control = controlsFor(tile).find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  if (!control) return `${tile.name} has no control called ${name}. It has: ${controlsFor(tile).map((c) => c.name).join(", ")}.`;
  const resolved = { action: control.action, sensitive: Boolean(control.needsConfirmation), label: control.name };
  if (control.kind === "press") return resolved;
  if (control.kind === "number") {
    const number = Number(value);
    if (value === undefined || value === null || !Number.isFinite(number)) return `${control.name} needs a number.`;
    if (number < (control.min ?? -Infinity) || number > (control.max ?? Infinity)) return `${control.name} goes from ${control.min} to ${control.max}.`;
    return { ...resolved, value: number };
  }
  const option = control.optionValue?.(String(value));
  if (option === undefined) return `${control.name} can be: ${control.options?.join(", ")}.`;
  return { ...resolved, value: option };
}

type Status = "weather" | "agenda" | "media" | "timers";

// What the assistant can look up. All of it comes from outside and is only ever data.
export function statusOf(world: Snapshot, topic: Status): unknown {
  const all = Object.values(world.data);
  if (topic === "weather") {
    const weather = all.find(({ weather }) => weather)?.weather;
    return weather && { ...weather, hourly: weather.hourly.slice(0, 12), daily: weather.daily.slice(0, 7) };
  }
  if (topic === "agenda") return all.flatMap(({ agenda }) => agenda ?? []).slice(0, 20);
  if (topic === "media") return all.flatMap(({ players }) => Object.values(players ?? {})).map(({ name, state, title, by }) => ({ name, state, title, by }));
  return all.flatMap(({ timers }) => Object.values(timers ?? {})).map(({ label, endsAt }) => ({ label, endsAt }));
}

export const faceNames: PanelSettings["faces"] = ["modular", "clock", "weather", "music", "cameras"];
