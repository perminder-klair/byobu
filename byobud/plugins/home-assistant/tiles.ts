// Turns Home Assistant entities into tiles and sheets. Everything byōbu knows about particular
// kinds of device is here, as plain functions from state to data.
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiBlindsHorizontal,
  mdiDoorOpen,
  mdiFan,
  mdiFanOff,
  mdiGarage,
  mdiGarageOpen,
  mdiHelpCircleOutline,
  mdiLightbulb,
  mdiLightbulbOutline,
  mdiLock,
  mdiLockOpenVariant,
  mdiPaletteOutline,
  mdiPause,
  mdiPlay,
  mdiPlayCircleOutline,
  mdiPowerPlug,
  mdiPowerPlugOff,
  mdiSkipNext,
  mdiSkipPrevious,
  mdiSpeaker,
  mdiStop,
  mdiThermostat,
  mdiVolumeHigh,
  mdiVolumeOff,
  mdiWindowShutter,
  mdiWindowShutterOpen,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { Action, Button, Choices, Player, Section, Slider, Tile } from "../../src/protocol.ts";
import { ClimateFeature, CoverFeature, FanFeature, LightFeature, LockFeature, MediaFeature } from "./features.ts";

// The kinds of thing a room can hold, in the order they appear in it.
export const CONTROLS = ["light", "switch", "fan", "climate", "cover", "lock", "media_player"];

const COLOUR_MODES = ["hs", "rgb", "rgbw", "rgbww", "xy"];
// From candlelight to daylight, roughly as a bulb shows them.
const WARM_TO_COOL = "linear-gradient(to right, #ff9a3c, #ffd2a1 35%, #fff4e8 70%, #dce8ff)";
const HUES = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
// Opening these from a stray tap would be a security problem, so a tap opens the sheet, where
// Open is a separate press.
const SECURE_COVERS = ["door", "garage", "gate"];

export const domain = (entity: HassEntity) => entity.entity_id.split(".")[0];
export const entityName = (entity: HassEntity): string => entity.attributes.friendly_name ?? entity.entity_id;

const supports = (entity: HassEntity, feature: number) => ((entity.attributes.supported_features ?? 0) & feature) !== 0;

// States and modes as words: "fan_only" reads "Fan only".
export function stateLabel(state: string): string {
  if (state === "heat_cool") return "Heat/cool";
  return state.charAt(0).toUpperCase() + state.slice(1).replaceAll("_", " ");
}

// "Living Room Ceiling Lights" reads as "Ceiling Lights" under Living Room.
export function nameInRoom(entity: HassEntity, room?: string): string {
  const name = entityName(entity);
  if (!room || !name.toLowerCase().startsWith(`${room.toLowerCase()} `)) return name;
  const rest = name.slice(room.length + 1);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

const call = (entity: HassEntity, service: string, data?: object): Action => ({
  id: "call",
  data: { entity: entity.entity_id, service, data },
});
// Calls a service with the control's value as one field.
const set = (entity: HassEntity, service: string, field: string): Action => ({
  id: "set",
  data: { entity: entity.entity_id, service, field },
});
const special = (id: string, entity: HassEntity): Action => ({ id, data: { entity: entity.entity_id } });

const options = (values: string[]) => values.map((value) => ({ value, label: stateLabel(value) }));

function choices(label: string, values: string[], value: string | null | undefined, action: Action): Choices {
  return { type: "choices", label, options: options(values), value, action };
}

function percentSlider(label: string, value: number | undefined, action: Action, extra?: Partial<Slider>): Slider {
  return { type: "slider", label, value, min: 0, max: 100, suffix: "%", action, ...extra };
}

type Base = Pick<Tile, "id" | "name" | "room" | "changedAt" | "state" | "unavailable">;
type Input = { entity: HassEntity; name: string; base: Base };

function light({ entity, base }: Input): Tile {
  const on = entity.state === "on";
  const { brightness, color_mode, color_temp_kelvin, hs_color, rgb_color, effect, effect_list } = entity.attributes;
  const { min_color_temp_kelvin = 2000, max_color_temp_kelvin = 6500 } = entity.attributes;
  const modes: string[] = entity.attributes.supported_color_modes ?? [];
  const percent = brightness != null ? Math.round((brightness / 255) * 100) : undefined;
  const tone = on && rgb_color ? `rgb(${rgb_color.join(" ")})` : "yellow";
  const sections: Section[] = [];
  if (modes.some((mode) => mode !== "onoff")) {
    sections.push(percentSlider("Brightness", on ? (percent ?? 0) : 0, special("brightness", entity), { names: { 0: "Off" } }));
  }
  if (modes.includes("color_temp")) {
    sections.push({
      type: "slider",
      label: "Colour temperature",
      value: on && color_mode === "color_temp" ? color_temp_kelvin : undefined,
      min: min_color_temp_kelvin,
      max: max_color_temp_kelvin,
      step: 50,
      suffix: " K",
      gradient: WARM_TO_COOL,
      action: set(entity, "turn_on", "color_temp_kelvin"),
    });
  }
  if (modes.some((mode) => COLOUR_MODES.includes(mode))) {
    sections.push({
      type: "slider",
      label: "Colour",
      value: on && COLOUR_MODES.includes(color_mode) ? hs_color?.[0] : undefined,
      min: 0,
      max: 360,
      gradient: HUES,
      action: special("hue", entity),
    });
  }
  if (supports(entity, LightFeature.EFFECT) && effect_list) {
    sections.push(choices("Effect", effect_list, effect, set(entity, "turn_on", "effect")));
  }
  return {
    ...base,
    icon: on ? mdiLightbulb : mdiLightbulbOutline,
    tone,
    active: on,
    detail: on ? (percent != null ? `${percent}%` : "On") : "Off",
    tap: call(entity, "toggle"),
    sheet: { tone, power: { on, action: call(entity, "toggle") }, sections },
  };
}

function switchTile({ entity, base }: Input): Tile {
  const on = entity.state === "on";
  return {
    ...base,
    icon: on ? mdiPowerPlug : mdiPowerPlugOff,
    tone: "yellow",
    active: on,
    detail: on ? "On" : "Off",
    tap: call(entity, "toggle"),
    sheet: {
      sections: [
        {
          type: "buttons",
          buttons: [
            { icon: mdiPowerPlugOff, label: "Off", selected: !on, action: call(entity, "turn_off") },
            { icon: mdiPowerPlug, label: "On", selected: on, action: call(entity, "turn_on") },
          ],
        },
      ],
    },
  };
}

function fan({ entity, base }: Input): Tile {
  const on = entity.state === "on";
  const { percentage, percentage_step, preset_mode, preset_modes, oscillating, direction } = entity.attributes;
  const sections: Section[] = [];
  if (supports(entity, FanFeature.SET_SPEED)) {
    // A fan running a preset may have no speed of its own.
    const value = on ? (percentage ?? undefined) : 0;
    sections.push(percentSlider("Speed", value, special("speed", entity), { step: percentage_step ?? 1, names: { 0: "Off" } }));
  }
  if (supports(entity, FanFeature.PRESET_MODE) && preset_modes) {
    sections.push(choices("Mode", preset_modes, preset_mode, set(entity, "set_preset_mode", "preset_mode")));
  }
  if (supports(entity, FanFeature.OSCILLATE)) {
    sections.push(choices("Oscillate", ["off", "on"], oscillating ? "on" : "off", special("oscillate", entity)));
  }
  if (supports(entity, FanFeature.DIRECTION)) {
    sections.push(choices("Direction", ["forward", "reverse"], direction, set(entity, "set_direction", "direction")));
  }
  return {
    ...base,
    icon: on ? mdiFan : mdiFanOff,
    tone: "green",
    active: on,
    detail: on ? (percentage != null ? `${percentage}%` : "On") : "Off",
    tap: call(entity, "toggle"),
    sheet: { power: { on, action: call(entity, "toggle") }, sections },
  };
}

function climate({ entity, base }: Input): Tile {
  const { current_temperature, current_humidity, temperature, target_temp_low, target_temp_high, hvac_action } = entity.attributes;
  const { hvac_modes = [], preset_mode, preset_modes, fan_mode, fan_modes } = entity.attributes;
  const { min_temp = 7, max_temp = 35, target_temp_step: step = 0.5 } = entity.attributes;
  const cooling = hvac_action === "cooling" || entity.state === "cool";
  const limits = { min: min_temp, max: max_temp, step };
  const range = target_temp_low != null ? `${target_temp_low}-${target_temp_high}` : undefined;
  const target = temperature ?? range;
  const status = stateLabel(hvac_action ?? entity.state);
  const setTemperature = set(entity, "set_temperature", "temperature");
  const running = entity.state !== "off";
  const setpoints = !running
    ? []
    : temperature != null
      ? [{ label: "Target", value: temperature, ...limits, action: setTemperature }]
      : target_temp_low != null
        ? [
            { label: "Heat to", value: target_temp_low, ...limits, action: { id: "range", data: { entity: entity.entity_id, end: "target_temp_low", other: target_temp_high } } },
            { label: "Cool to", value: target_temp_high, ...limits, action: { id: "range", data: { entity: entity.entity_id, end: "target_temp_high", other: target_temp_low } } },
          ]
        : [];
  const reading = [
    current_temperature != null && `Now ${current_temperature}°`,
    current_humidity != null && `${Math.round(current_humidity)}% humidity`,
    hvac_action && stateLabel(hvac_action),
  ].filter(Boolean);
  const sections: Section[] = [
    { type: "setpoints", setpoints, reading: reading.join(" · ") },
    choices("Mode", hvac_modes, entity.state, set(entity, "set_hvac_mode", "hvac_mode")),
  ];
  if (supports(entity, ClimateFeature.PRESET_MODE) && preset_modes) {
    sections.push(choices("Preset", preset_modes, preset_mode, set(entity, "set_preset_mode", "preset_mode")));
  }
  if (supports(entity, ClimateFeature.FAN_MODE) && fan_modes) {
    sections.push(choices("Fan", fan_modes, fan_mode, set(entity, "set_fan_mode", "fan_mode")));
  }
  const tone = cooling ? "blue" : "heat";
  return {
    ...base,
    icon: mdiThermostat,
    tone,
    active: running,
    detail: [current_temperature != null && `${current_temperature}°`, target != null && `set ${target}°`, status].filter(Boolean).join(" · "),
    value: target != null ? String(target) : current_temperature != null ? String(current_temperature) : undefined,
    stepper: temperature != null && running ? { value: temperature, ...limits, action: setTemperature } : undefined,
    sheet: { tone, sections },
  };
}

function cover({ entity, base }: Input): Tile {
  const { state } = entity;
  const { current_position, current_tilt_position, device_class } = entity.attributes;
  const open = state === "open" || state === "opening";
  const secure = SECURE_COVERS.includes(device_class ?? "");
  const can = (feature: number) => supports(entity, feature);
  const icons = device_class === "garage" ? [mdiGarageOpen, mdiGarage] : [mdiWindowShutterOpen, mdiWindowShutter];
  const position = state === "open" && current_position != null ? ` · ${current_position}%` : "";
  // Some covers, like a pergola's louvres, only tilt.
  const toggle = can(CoverFeature.OPEN) || can(CoverFeature.CLOSE) ? "toggle" : "toggle_cover_tilt";
  const buttons: Button[] = [];
  if (can(CoverFeature.OPEN)) buttons.push({ icon: mdiArrowUp, label: "Open", selected: open, action: call(entity, "open_cover") });
  if (can(CoverFeature.STOP)) buttons.push({ icon: mdiStop, label: "Stop", action: call(entity, "stop_cover") });
  if (can(CoverFeature.CLOSE)) {
    buttons.push({ icon: mdiArrowDown, label: "Close", selected: state === "closed" || state === "closing", action: call(entity, "close_cover") });
  }
  const sections: Section[] = [];
  if (buttons.length > 0) sections.push({ type: "buttons", buttons });
  if (can(CoverFeature.SET_POSITION)) {
    sections.push(percentSlider("Position", current_position, set(entity, "set_cover_position", "position"), { suffix: "% open", names: { 0: "Closed", 100: "Open" } }));
  }
  if (can(CoverFeature.SET_TILT_POSITION)) {
    sections.push(percentSlider("Tilt", current_tilt_position, set(entity, "set_cover_tilt_position", "tilt_position")));
  }
  return {
    ...base,
    icon: open ? icons[0] : icons[1],
    tone: "cyan",
    active: open,
    detail: stateLabel(state) + position,
    tap: secure && !open ? undefined : call(entity, toggle),
    sheet: { sections },
  };
}

function lock({ entity, base }: Input): Tile {
  const { state } = entity;
  const locked = state === "locked";
  const buttons: Button[] = [
    { icon: mdiLock, label: "Lock", selected: locked || state === "locking", action: call(entity, "lock") },
    { icon: mdiLockOpenVariant, label: "Unlock", selected: state === "unlocked" || state === "unlocking", action: call(entity, "unlock") },
  ];
  if (supports(entity, LockFeature.OPEN)) {
    buttons.push({ icon: mdiDoorOpen, label: "Open", selected: state === "open" || state === "opening", action: call(entity, "open") });
  }
  return {
    ...base,
    icon: locked ? mdiLock : mdiLockOpenVariant,
    tone: "red",
    active: !locked,
    detail: stateLabel(state),
    // Unlocking is done from the sheet, so it can't happen by brushing the screen.
    tap: locked ? undefined : call(entity, "lock"),
    sheet: { tone: locked ? "green" : "red", sections: [{ type: "buttons", buttons }] },
  };
}

function transport(entity: HassEntity): Button[] {
  const can = (feature: number) => supports(entity, feature);
  const playing = entity.state === "playing";
  const buttons: Button[] = [];
  if (can(MediaFeature.PREVIOUS_TRACK)) buttons.push({ icon: mdiSkipPrevious, label: "Previous", action: call(entity, "media_previous_track") });
  if (can(MediaFeature.PAUSE) || can(MediaFeature.PLAY)) {
    buttons.push({ icon: playing ? mdiPause : mdiPlay, label: playing ? "Pause" : "Play", selected: true, action: call(entity, "media_play_pause") });
  }
  if (can(MediaFeature.NEXT_TRACK)) buttons.push({ icon: mdiSkipNext, label: "Next", action: call(entity, "media_next_track") });
  return buttons;
}

function byLine({ attributes: { media_artist, media_series_title, media_album_name, app_name } }: HassEntity): string {
  return [media_artist ?? media_series_title, media_album_name ?? app_name].filter(Boolean).join(" · ");
}

function media({ entity, base }: Input, picture: (path: string) => string): Tile {
  const { entity_picture, media_title, media_artist, volume_level, is_volume_muted, source, source_list } = entity.attributes;
  const can = (feature: number) => supports(entity, feature);
  const on = entity.state !== "off";
  const playable = on && (can(MediaFeature.PAUSE) || can(MediaFeature.PLAY));
  const sections: Section[] = [];
  if (on) {
    sections.push({ type: "media", title: media_title, by: byLine(entity), picture: entity_picture && picture(entity_picture), controls: transport(entity) });
    if (can(MediaFeature.VOLUME_SET)) {
      sections.push(percentSlider("Volume", volume_level != null ? Math.round(volume_level * 100) : undefined, special("volume", entity)));
    }
    if (can(MediaFeature.VOLUME_MUTE)) {
      sections.push({
        type: "buttons",
        buttons: [
          {
            icon: is_volume_muted ? mdiVolumeOff : mdiVolumeHigh,
            label: is_volume_muted ? "Unmute" : "Mute",
            selected: is_volume_muted,
            action: call(entity, "volume_mute", { is_volume_muted: !is_volume_muted }),
          },
        ],
      });
    }
    if (can(MediaFeature.SELECT_SOURCE) && source_list) {
      // Sources are names the device gives, like "HDMI 1", so they're shown as they are.
      sections.push({
        type: "choices",
        label: "Source",
        options: source_list.map((value: string) => ({ value, label: value })),
        value: source,
        action: set(entity, "select_source", "source"),
      });
    }
  }
  return {
    ...base,
    kind: "media",
    icon: mdiSpeaker,
    tone: "magenta",
    active: entity.state === "playing",
    detail: media_title ? [media_title, media_artist].filter(Boolean).join(" · ") : stateLabel(entity.state),
    tap: playable ? call(entity, "media_play_pause") : undefined,
    sheet: {
      power: can(MediaFeature.TURN_ON) && can(MediaFeature.TURN_OFF) ? { on, action: call(entity, on ? "turn_off" : "turn_on") } : undefined,
      sections,
    },
  };
}

function scene({ entity, base }: Input): Tile {
  return {
    ...base,
    kind: "scene",
    icon: domain(entity) === "script" ? mdiPlayCircleOutline : mdiPaletteOutline,
    tone: "accent",
    active: false,
    detail: "Tap to run",
    tap: call(entity, "turn_on"),
  };
}

const BUILDERS: Record<string, (input: Input) => Tile> = { light, switch: switchTile, fan, climate, cover, lock, scene, script: scene };

export function tileFor(entity: HassEntity, room: string | undefined, picture: (path: string) => string): Tile {
  const name = nameInRoom(entity, room);
  const base: Base = {
    id: entity.entity_id,
    name,
    room,
    changedAt: entity.last_changed,
    state: stateLabel(entity.state),
    unavailable: entity.state === "unavailable" || undefined,
  };
  const input = { entity, name, base };
  if (domain(entity) === "media_player") return media(input, picture);
  const build = BUILDERS[domain(entity)];
  if (build) return build(input);
  return { ...base, icon: mdiHelpCircleOutline, tone: "accent", active: false, detail: stateLabel(entity.state) };
}

// The three small tiles under Modular's main window.
export function summaries(tiles: Tile[], entities: HassEntity[]): Tile[] {
  const of = (kind: string) => entities.filter((entity) => domain(entity) === kind);
  const lights = of("light");
  const locks = of("lock");
  const covers = of("cover");
  const lit = lights.filter((light) => light.state === "on").length;
  const unlocked = locks.filter((lock) => lock.state !== "locked").length;
  const open = covers.filter((cover) => cover.state !== "closed").length;
  const summary = (id: string, name: string, icon: string, tone: string, active: boolean, value: string, total: number): Tile => ({
    id: `summary.${id}`,
    name,
    icon,
    tone,
    active,
    detail: `of ${total}`,
    value,
    kind: "summary",
    link: "app:home",
  });
  const list: Tile[] = [];
  if (lights.length > 0) list.push(summary("lights", "lights", mdiLightbulbOutline, "yellow", lit > 0, `${lit} on`, lights.length));
  if (locks.length > 0) {
    list.push(summary("locks", "locks", unlocked > 0 ? mdiLockOpenVariant : mdiLock, "red", unlocked > 0, unlocked > 0 ? `${unlocked} unlocked` : "locked", locks.length));
  }
  if (covers.length > 0) list.push(summary("blinds", "blinds", mdiBlindsHorizontal, "cyan", open > 0, `${open} open`, covers.length));
  return [...tiles, ...list];
}

export function playerFor(entity: HassEntity, picture: (path: string) => string): Player {
  const { entity_picture, media_title, media_position, media_duration, media_position_updated_at } = entity.attributes;
  const states: Record<string, Player["state"]> = { playing: "playing", paused: "paused", off: "off" };
  return {
    id: entity.entity_id,
    name: entityName(entity),
    state: states[entity.state] ?? "idle",
    title: media_title,
    by: byLine(entity),
    picture: entity_picture && picture(entity_picture),
    position: media_position,
    duration: media_duration,
    positionAt: media_position_updated_at,
    controls: transport(entity),
    tile: entity.entity_id,
  };
}
