// The contract between byobud and a plugin. A plugin is a folder with a manifest.json and an
// index file whose default export is a Plugin. It's handed its settings and a Host, and
// publishes plain data: rebuilding everything on each change is fine, as the Host only passes
// on what's different.
import type { PluginData, PluginStatus, SettingField } from "./protocol.ts";

export type Manifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  enabledByDefault?: boolean;
  schema?: SettingField[];
};

export type Host = {
  settings: Record<string, string | number | boolean>;
  publish: (data: PluginData) => void;
  status: (state: PluginStatus["state"], message?: string) => void;
  log: (...args: unknown[]) => void;
  // A folder of the plugin's own, for caches and config files.
  directory: string;
  // Whatever the plugin last saved with store(), kept across restarts.
  stored: unknown;
  store: (value: unknown) => void;
  chime: () => void;
  // The address clients can load a picture from, passed back to the plugin's picture().
  pictureUrl: (path: string) => string;
};

export type PluginInstance = {
  // value is what a control was set to, for things like sliders.
  act?: (id: string, data: Record<string, unknown> | undefined, value: unknown) => Promise<void> | void;
  picture?: (path: string) => Promise<Response>;
  stop?: () => Promise<void> | void;
};

export type Plugin = (host: Host) => PluginInstance | Promise<PluginInstance>;
