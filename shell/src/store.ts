// The connection to byobud, kept in a small store that components read with useStore(). byobud
// sends everything on connecting, then only what changed, and EventSource reconnects by itself
// and gets everything again. This is all the shell knows of the outside world: plugins do the
// talking, and it draws what they publish.
import { useSyncExternalStore } from "react";
import type {
  Action,
  Alert,
  AgendaEvent,
  Camera,
  KeyedData,
  Locale,
  PanelSettings,
  Player,
  PluginSummary,
  Snapshot,
  Tile,
  Timer,
  Update,
  Weather,
} from "../../byobud/src/protocol.ts";

export type * from "../../byobud/src/protocol.ts";

export type Store = { connected: boolean; snapshot?: Snapshot };

// Things carry the plugin they came from, which is who their actions go back to.
export type Placed<T> = T & { plugin: string };

export type Room = { name: string; tiles: Placed<Tile>[] };

let store: Store = { connected: false };
const listeners = new Set<() => void>();

function set(next: Store) {
  store = next;
  for (const listener of listeners) listener();
}

function applied(snapshot: Snapshot, update: Update): Snapshot {
  if (update.type === "plugins") return { ...snapshot, plugins: update.plugins };
  if (update.type === "panel") return { ...snapshot, panel: update.panel };
  if (update.type === "outputs") return { ...snapshot, outputs: update.outputs };
  const { plugin, key, id, value } = update;
  const data = { ...snapshot.data[plugin] } as Record<string, unknown>;
  if (id === undefined) data[key] = value;
  else {
    const items = { ...(data[key] as Record<string, unknown> | undefined) };
    if (value === undefined) delete items[id];
    else items[id] = value;
    data[key] = items;
  }
  return { ...snapshot, data: { ...snapshot.data, [plugin]: data as KeyedData } };
}

export function connect() {
  const events = new EventSource("api/events");
  events.addEventListener("snapshot", (event) => set({ connected: true, snapshot: JSON.parse(event.data) }));
  events.onmessage = (event) => {
    if (store.snapshot) set({ ...store, snapshot: applied(store.snapshot, JSON.parse(event.data)) });
  };
  events.onerror = () => set({ ...store, connected: false });
}

export const getStore = () => store;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore(): Store {
  return useSyncExternalStore(subscribe, getStore);
}

async function send(method: string, path: string, body: object) {
  const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) console.error(`${method} ${path} failed:`, await response.text());
}

export function act(plugin: string, { id, data }: Action, value?: unknown) {
  send("POST", `api/plugins/${plugin}/actions/${id}`, { data, value }).catch(console.error);
}

export function updatePanel(changes: Partial<PanelSettings>) {
  send("PUT", "api/panel", changes).catch(console.error);
}

export function updatePlugin(id: string, changes: { enabled?: boolean; values?: Record<string, unknown> }) {
  send("PUT", `api/plugins/${id}`, changes).catch(console.error);
}

export function selectOutput(id: string) {
  send("PUT", "api/output", { id }).catch(console.error);
}

export function setBacklight(percent: number) {
  send("POST", "api/backlight", { percent }).catch(console.error);
}

const entries = ({ snapshot }: Store) =>
  (snapshot?.plugins ?? []).flatMap(({ id }) => (snapshot?.data[id] ? [[id, snapshot.data[id]] as const] : []));

export const allTiles = (from: Store): Placed<Tile>[] =>
  entries(from).flatMap(([plugin, data]) => Object.values(data.tiles ?? {}).map((tile) => ({ ...tile, plugin })));

export function findTile(from: Store, plugin: string, id: string): Placed<Tile> | undefined {
  const tile = from.snapshot?.data[plugin]?.tiles?.[id];
  return tile && { ...tile, plugin };
}

// One room per name, in the order plugins gave them, then whatever isn't in one.
export function rooms(from: Store): Room[] {
  const controls = allTiles(from).filter(({ kind }) => !kind || kind === "media");
  const byRoom = Map.groupBy(controls, ({ room }) => room);
  const names = [...new Set(entries(from).flatMap(([, data]) => data.rooms ?? []))];
  const unknown = [...byRoom.keys()].filter((name): name is string => !!name && !names.includes(name));
  return [
    ...[...names, ...unknown].map((name) => ({ name, tiles: byRoom.get(name) ?? [] })),
    { name: names.length > 0 ? "Other" : "Everything", tiles: byRoom.get(undefined) ?? [] },
  ].filter(({ tiles }) => tiles.length > 0);
}

export const firstWeather = (from: Store): Weather | undefined => entries(from).find(([, data]) => data.weather)?.[1].weather;

export const agenda = (from: Store): AgendaEvent[] =>
  entries(from)
    .flatMap(([, data]) => data.agenda ?? [])
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

export const players = (from: Store): Placed<Player>[] =>
  entries(from).flatMap(([plugin, data]) => Object.values(data.players ?? {}).map((player) => ({ ...player, plugin })));

// What's playing, or failing that paused, for the Now Playing face and widget.
export function activePlayer(from: Store): Placed<Player> | undefined {
  const named = players(from).filter(({ title }) => title);
  return named.find(({ state }) => state === "playing") ?? named.find(({ state }) => state === "paused");
}

export const cameras = (from: Store): Camera[] => entries(from).flatMap(([, data]) => Object.values(data.cameras ?? {}));

export const timers = (from: Store): Placed<Timer>[] =>
  entries(from)
    .flatMap(([plugin, data]) => Object.values(data.timers ?? {}).map((timer) => ({ ...timer, plugin })))
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));

export const alerts = (from: Store): Placed<Alert>[] =>
  entries(from).flatMap(([plugin, data]) => Object.values(data.alerts ?? {}).map((alert) => ({ ...alert, plugin })));

export const locale = (from: Store): Locale | undefined => entries(from).find(([, data]) => data.locale)?.[1].locale;

// Something the shell should say out loud, like a lost connection. Settings has the rest.
export function problem({ connected, snapshot }: Store): string | undefined {
  if (!connected) return snapshot ? "Reconnecting to byobud…" : "Starting…";
  return snapshot?.plugins.find(({ enabled, status }: PluginSummary) => enabled && status.state === "error")?.status.message;
}
