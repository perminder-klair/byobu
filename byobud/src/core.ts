// Runs the plugins and holds what they've published. Clients get a snapshot, then only what
// changed, so a plugin can publish everything every time.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Host, Manifest, Plugin, PluginInstance } from "./plugin.ts";
import type { KeyedData, Output, PanelSettings, PluginData, PluginStatus, PluginSummary, Snapshot, Update } from "./protocol.ts";
import { applyValues, loadPanel, loadPlugin, redact, savePanel, savePlugin, withDefaults, type PluginRecord } from "./settings.ts";
import { Clients } from "./clients.ts";
import { silent, type Sound } from "./sound.ts";

const KEYED = ["tiles", "players", "cameras", "timers", "alerts"] as const;
const OUTPUTS_REFRESH_MS = 10_000;
const DUCKED_VOLUME = 15;
const ENTRY_NAMES = ["index.mjs", "index.js", "index.ts"];

type Loaded = {
  manifest: Manifest;
  directory: string;
  record: PluginRecord;
  status: PluginStatus;
  instance?: PluginInstance;
  // Bumped on each start, so a stopped plugin's late publishes can be ignored.
  generation: number;
};

export class Core {
  private plugins = new Map<string, Loaded>();
  private data: Record<string, KeyedData> = {};
  private listeners = new Set<(update: Update) => void>();
  panel: PanelSettings;
  themes: string[] = [];
  version = "development";
  private outputs: Output[] = [];
  private microphone = false;
  private outputsTimer?: ReturnType<typeof setInterval>;
  readonly clients: Clients;
  private readonly state: string;
  private readonly sound: Sound;

  constructor(state: string, sound: Sound = silent) {
    this.state = state;
    this.sound = sound;
    this.panel = loadPanel(state);
    this.clients = new Clients(state);
  }

  // Later directories can't replace a plugin an earlier one already has.
  async start(directories: string[]) {
    for (const directory of directories) {
      if (!existsSync(directory)) continue;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        this.discover(join(directory, entry.name));
      }
    }
    this.refreshOutputs();
    // Speakers come and go, and nothing announces it.
    this.outputsTimer = setInterval(() => this.refreshOutputs(), OUTPUTS_REFRESH_MS);
    await Promise.all([...this.plugins.keys()].map((id) => this.startPlugin(id)));
  }

  private async refreshOutputs() {
    const { outputs, microphone } = await this.sound.devices();
    if (JSON.stringify(outputs) === JSON.stringify(this.outputs) && microphone === this.microphone) return;
    // At boot PipeWire isn't ready yet, and a new speaker comes up at its own volume.
    if (outputs.length > 0) this.sound.setVolume(this.panel.volume);
    this.outputs = outputs;
    this.microphone = microphone;
    this.emit({ type: "outputs", outputs, microphone });
  }

  async selectOutput(id: string) {
    await this.sound.select(id);
    await this.refreshOutputs();
  }

  private discover(directory: string) {
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
      if (manifest.schemaVersion !== 1 || !/^[a-z0-9.-]+$/.test(manifest.id)) throw new Error("bad manifest");
    } catch (error) {
      console.error(`Skipping the plugin in ${directory}:`, error);
      return;
    }
    if (this.plugins.has(manifest.id)) return;
    const record = loadPlugin(this.state, manifest.id);
    this.plugins.set(manifest.id, { manifest, directory, record, status: { state: "off" }, generation: 0 });
  }

  private enabled({ manifest, record }: Loaded) {
    return record.enabled ?? manifest.enabledByDefault ?? false;
  }

  private async startPlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin || !this.enabled(plugin)) return;
    const generation = ++plugin.generation;
    const current = () => plugin.generation === generation;
    this.setStatus(plugin, { state: "starting" });
    const directory = join(this.state, "plugins", id);
    mkdirSync(directory, { recursive: true });
    const host: Host = {
      settings: withDefaults(plugin.manifest.schema ?? [], plugin.record.values),
      publish: (data) => current() && this.publish(id, data),
      status: (state, message) => current() && this.setStatus(plugin, { state, message }),
      log: (...args) => console.log(`[${id}]`, ...args),
      pictureUrl: (path) => `/api/pictures/${id}/${encodeURIComponent(path)}`,
      directory,
      installed: plugin.directory,
      stored: plugin.record.stored,
      store: (value) => {
        plugin.record.stored = value;
        savePlugin(this.state, id, plugin.record);
      },
      chime: () => this.sound.chime(),
      cue: () => this.sound.cue(),
      duck: (down) => this.sound.setVolume(down ? Math.min(this.panel.volume, DUCKED_VOLUME) : this.panel.volume),
      world: () => this.snapshot(),
      perform: (plugin, { id: action, data }, value) => this.act(plugin, action, data, value),
      showFace: (face) => this.showFace(face),
    };
    try {
      const entry = ENTRY_NAMES.map((name) => join(plugin.directory, name)).find(existsSync);
      if (!entry) throw new Error("no index file");
      const { default: factory } = (await import(pathToFileURL(entry).href)) as { default: Plugin };
      const instance = await factory(host);
      if (current()) plugin.instance = instance;
      else await instance.stop?.();
    } catch (error) {
      console.error(`Plugin ${id} failed to start:`, error);
      if (current()) this.setStatus(plugin, { state: "error", message: String(error) });
    }
  }

  private async stopPlugin(id: string) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    plugin.generation++;
    const { instance } = plugin;
    plugin.instance = undefined;
    try {
      await instance?.stop?.();
    } catch (error) {
      console.error(`Plugin ${id} failed to stop:`, error);
    }
    this.clear(id);
    this.setStatus(plugin, { state: "off" });
  }

  private setStatus(plugin: Loaded, status: PluginStatus) {
    plugin.status = status;
    this.emit({ type: "plugins", plugins: this.summaries() });
  }

  private emit(update: Update) {
    for (const listener of this.listeners) listener(update);
  }

  subscribe(listener: (update: Update) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Compares by value, so only real changes reach clients.
  private publish(plugin: string, data: PluginData) {
    const stored = (this.data[plugin] ??= {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(data) as [keyof PluginData, unknown][]) {
      if ((KEYED as readonly string[]).includes(key)) {
        const items = stored[key] as Record<string, unknown> | undefined ?? (stored[key] = {} as Record<string, unknown>) as Record<string, unknown>;
        const next = new Map((value as { id: string }[]).map((item) => [item.id, item]));
        for (const id of Object.keys(items)) {
          if (next.has(id)) continue;
          delete items[id];
          this.emit({ type: "data", plugin, key, id, value: undefined });
        }
        for (const [id, item] of next) {
          if (JSON.stringify(items[id]) === JSON.stringify(item)) continue;
          items[id] = item;
          this.emit({ type: "data", plugin, key, id, value: item });
        }
      } else if (JSON.stringify(stored[key]) !== JSON.stringify(value)) {
        stored[key] = value;
        this.emit({ type: "data", plugin, key, value });
      }
    }
  }

  // A stopped plugin's things leave every client.
  private clear(plugin: string) {
    const stored = this.data[plugin] as Record<string, unknown> | undefined;
    if (!stored) return;
    delete this.data[plugin];
    for (const key of Object.keys(stored) as (keyof PluginData)[]) {
      if ((KEYED as readonly string[]).includes(key)) {
        for (const id of Object.keys(stored[key] as object)) this.emit({ type: "data", plugin, key, id, value: undefined });
      } else this.emit({ type: "data", plugin, key, value: undefined });
    }
  }

  summaries(): PluginSummary[] {
    return [...this.plugins.values()].map((plugin) => {
      const schema = plugin.manifest.schema ?? [];
      return {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        description: plugin.manifest.description,
        version: plugin.manifest.version,
        enabled: this.enabled(plugin),
        status: plugin.status,
        schema,
        values: redact(schema, withDefaults(schema, plugin.record.values)),
      };
    });
  }

  snapshot(): Snapshot {
    return { plugins: this.summaries(), data: this.data, panel: this.panel, themes: this.themes, outputs: this.outputs, microphone: this.microphone, clients: this.clients.list(), version: this.version };
  }

  async act(id: string, action: string, data: Record<string, unknown> | undefined, value: unknown) {
    const plugin = this.plugins.get(id);
    if (!plugin?.instance?.act) throw new Error(`Plugin ${id} isn't taking actions`);
    await plugin.instance.act(action, data, value);
  }

  picture(id: string, path: string) {
    return this.plugins.get(id)?.instance?.picture?.(path);
  }

  has(id: string) {
    return this.plugins.has(id);
  }

  async updatePlugin(id: string, changes: { enabled?: boolean; values?: Record<string, unknown> }) {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    await this.stopPlugin(id);
    if (changes.enabled !== undefined) plugin.record.enabled = changes.enabled;
    if (changes.values) plugin.record.values = applyValues(plugin.manifest.schema ?? [], plugin.record.values, changes.values);
    savePlugin(this.state, id, plugin.record);
    await this.startPlugin(id);
    this.emit({ type: "plugins", plugins: this.summaries() });
  }

  updatePanel(changes: Partial<PanelSettings>) {
    this.panel = { ...this.panel, ...changes };
    savePanel(this.state, this.panel);
    if (changes.volume !== undefined) this.sound.setVolume(changes.volume);
    this.emit({ type: "panel", panel: this.panel });
  }

  removeClient(id: string) {
    this.clients.remove(id);
    this.emit({ type: "clients", clients: this.clients.list() });
  }

  pair(code: string, name: string) {
    const token = this.clients.pair(code, name);
    if (token) this.emit({ type: "clients", clients: this.clients.list() });
    return token;
  }

  showFace(face: string) {
    this.emit({ type: "show", face });
  }

  async stop() {
    clearInterval(this.outputsTimer);
    await Promise.all([...this.plugins.keys()].map((id) => this.stopPlugin(id)));
  }
}
