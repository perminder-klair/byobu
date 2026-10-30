// What byobud and its clients say to each other: the panel's shell today, a phone and the
// assistant later. Plugins publish these and clients draw them, so nothing here knows about any
// one integration, and no plugin can draw anything a theme wouldn't suit.

// A theme colour's name, or any CSS colour for something with its own, like a light.
export type Tone = "accent" | "red" | "yellow" | "green" | "cyan" | "blue" | "magenta" | "heat" | (string & {});

// Something a client can ask a plugin to do. Controls send their value along with it.
export type Action = { id: string; data?: Record<string, unknown> };

export type Button = { icon: string; label: string; selected?: boolean; action: Action };

export type Slider = {
  type: "slider";
  label: string;
  value?: number;
  min: number;
  max: number;
  step?: number;
  // How the value reads: "%", " K". Unset shows no value.
  suffix?: string;
  // Words for particular values, like 0 reading "Off".
  names?: Record<string, string>;
  // A gradient to pick a point on, instead of a bar that fills up.
  gradient?: string;
  action: Action;
};

export type Choices = {
  type: "choices";
  label: string;
  options: { value: string; label: string }[];
  value?: string | null;
  action: Action;
};

export type Buttons = { type: "buttons"; buttons: Button[] };

export type Setpoint = { label: string; value: number; min: number; max: number; step: number; action: Action };
export type Setpoints = { type: "setpoints"; setpoints: Setpoint[]; reading?: string };

export type Media = {
  type: "media";
  title?: string;
  by?: string;
  picture?: string;
  controls: Button[];
};

export type Section = Slider | Choices | Buttons | Setpoints | Media;

// What a long press opens.
export type Sheet = {
  tone?: Tone;
  // An on/off button by the name, for things whose controls don't already say on or off.
  power?: { on: boolean; action: Action };
  sections: Section[];
};

export type Stepper = { value: number; min: number; max: number; step: number; action: Action };

export type Tile = {
  id: string;
  name: string;
  // The path of a 24 by 24 icon.
  icon: string;
  tone: Tone;
  active: boolean;
  detail: string;
  unavailable?: boolean;
  // Where it lives, by name. Things in no room are listed under Other.
  room?: string;
  // Which app it belongs to, for things that aren't controls in a room.
  kind?: "scene" | "media" | "summary";
  // What a tap does. With neither, a tap opens the sheet, which is also how anything that
  // shouldn't happen by brushing the screen, like unlocking, is done.
  tap?: Action;
  link?: `app:${string}`;
  // The number to show large, when this tile takes a face's main window.
  value?: string;
  stepper?: Stepper;
  // One line for the sheet's title, like "On".
  state?: string;
  changedAt?: string;
  sheet?: Sheet;
};

export type AgendaEvent = {
  id: string;
  // ISO times. All-day events have a date with no time.
  start: string;
  end?: string;
  summary: string;
  location?: string;
};

export type Forecast = {
  time: string;
  // One of Home Assistant's weather conditions, which every plugin uses: "sunny", "rainy"...
  condition?: string;
  temperature?: number;
  low?: number;
  rainChance?: number;
};

export type Weather = {
  condition: string;
  temperature: number;
  feelsLike?: number;
  humidity?: number;
  hourly: Forecast[];
  daily: Forecast[];
};

export type Player = {
  id: string;
  name: string;
  state: "playing" | "paused" | "idle" | "off";
  title?: string;
  by?: string;
  picture?: string;
  position?: number;
  duration?: number;
  positionAt?: string;
  controls: Button[];
  // The tile with this player's full controls.
  tile?: string;
};

export type Camera = { id: string; name: string; picture: string };

export type Locale = { language: string; timeZone?: string };

// Everything a plugin can publish. Anything left out stays as it was.
export type PluginData = {
  tiles?: Tile[];
  // Room names in the order the user likes them.
  rooms?: string[];
  agenda?: AgendaEvent[];
  weather?: Weather;
  players?: Player[];
  cameras?: Camera[];
  locale?: Locale;
};

export type PluginStatus = { state: "off" | "starting" | "ok" | "error"; message?: string };

export type PanelSettings = {
  brightness: number;
  night: "auto" | "on" | "off";
  // Minutes without a touch before the screen turns off, or 0 to leave it on.
  blankAfter: number;
  // A theme's name, or "" for the one the panel was set up with.
  theme: string;
  // Which faces show, in order.
  faces: string[];
  // The tile in Modular's main window and the three beneath it. Empty picks by itself.
  modular: { main: string; tiles: string[] };
};

// A setting a plugin asks for. The settings screen is built from these, so a plugin needs no UI.
export type SettingField = {
  key: string;
  label: string;
  description?: string;
  defaultValue?: string | number | boolean;
} & (
  | { type: "string" | "url" | "secret" }
  | { type: "boolean" }
  | { type: "number"; min: number; max: number; step?: number }
  | { type: "select"; options: { value: string; label: string }[] }
);

export type PluginSummary = {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  status: PluginStatus;
  schema: SettingField[];
  // Secrets are never sent to clients. Those that are set read as SECRET_SET instead.
  values: Record<string, string | number | boolean>;
};

export const SECRET_SET = "•••••••• set";

// What a client gets on connecting, then keeps up to date from Update messages.
export type Snapshot = {
  plugins: PluginSummary[];
  // One entry per plugin. Tiles, players and cameras are keyed by id so updates can be small.
  data: Record<string, KeyedData>;
  panel: PanelSettings;
  themes: string[];
};

export type KeyedData = Omit<PluginData, "tiles" | "players" | "cameras"> & {
  tiles?: Record<string, Tile>;
  players?: Record<string, Player>;
  cameras?: Record<string, Camera>;
};

export type Update =
  | { type: "data"; plugin: string; key: keyof PluginData; id?: string; value: unknown }
  | { type: "plugins"; plugins: PluginSummary[] }
  | { type: "panel"; panel: PanelSettings };
