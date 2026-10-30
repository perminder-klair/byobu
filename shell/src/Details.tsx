// The detail sheet a long press on a tile opens: everything a device can do beyond a tap, like a
// light's brightness and colour or a thermostat's mode.
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiClose,
  mdiDoorOpen,
  mdiLock,
  mdiLockOpenVariant,
  mdiMinus,
  mdiPause,
  mdiPlay,
  mdiPlus,
  mdiPower,
  mdiPowerPlug,
  mdiPowerPlugOff,
  mdiSkipNext,
  mdiSkipPrevious,
  mdiStop,
  mdiVolumeHigh,
  mdiVolumeOff,
} from "@mdi/js";
import { createContext, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ActionButton, Choices, IconButton, Slider, useStepper } from "./controls";
import { ClimateFeature, CoverFeature, FanFeature, LightFeature, LockFeature, MediaFeature } from "./features";
import { callAction, hassPicture, locale, stateLabel, supports, useHass, type HassEntity } from "./hass";

// Opens the sheet for an entity, under the name its tile shows.
export const ShowDetails = createContext<(entityId: string, name: string) => void>(() => {});

// A sheet left open closes by itself, so the panel goes back to what was under it.
const IDLE_CLOSE_MS = 30_000;

export type DetailsProps = { entity: HassEntity; name: string; room?: string; onClose: () => void };

type SheetLook = {
  tone: string;
  // An on/off button by the name, for things whose controls don't already say on or off.
  power?: { on: boolean; toggle: () => void };
  children?: ReactNode;
};

type SheetFrameProps = SheetLook & { title: string; subtitle: string; onClose: () => void };
type SheetProps = DetailsProps & SheetLook;

// "5 minutes ago", in Home Assistant's language.
function since(time: string, language?: string): string {
  const seconds = (Date.parse(time) - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (-seconds >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return format.format(0, "second");
}

export function SheetFrame({ title, subtitle, tone, power, onClose, children }: SheetFrameProps) {
  const idle = useRef<number | undefined>(undefined);
  const stillHere = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(onClose, IDLE_CLOSE_MS);
  }, [onClose]);
  useEffect(() => {
    stillHere();
    return () => window.clearTimeout(idle.current);
  }, [stillHere]);

  return (
    <div
      className="overlay"
      onPointerDownCapture={stillHere}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="sheet" style={{ "--tone": tone } as CSSProperties}>
        <div className="sheet-head">
          <div className="titles">
            <div className="sheet-name">{title}</div>
            <div className="sheet-state">{subtitle}</div>
          </div>
          {power && (
            <IconButton
              icon={mdiPower}
              label={power.on ? "Turn off" : "Turn on"}
              selected={power.on}
              onClick={power.toggle}
            />
          )}
          <IconButton icon={mdiClose} label="Close" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function Sheet({ entity, name, room, ...look }: SheetProps) {
  const { config } = useHass();
  const when = since(entity.last_changed, locale(config));
  const subtitle = [room, stateLabel(entity.state), when].filter(Boolean).join(" · ");
  return <SheetFrame title={name} subtitle={subtitle} {...look} />;
}

const offOrPercent = (value: number) => (value === 0 ? "Off" : `${Math.round(value)}%`);
const percent = (value: number) => `${Math.round(value)}%`;

const COLOUR_MODES = ["hs", "rgb", "rgbw", "rgbww", "xy"];
// From candlelight to daylight, roughly as a bulb shows them.
const WARM_TO_COOL = "linear-gradient(to right, #ff9a3c, #ffd2a1 35%, #fff4e8 70%, #dce8ff)";
const HUES = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

function LightDetails(props: DetailsProps) {
  const { entity } = props;
  const on = entity.state === "on";
  const { brightness, color_mode, color_temp_kelvin, hs_color, rgb_color, effect, effect_list } = entity.attributes;
  const { min_color_temp_kelvin = 2000, max_color_temp_kelvin = 6500 } = entity.attributes;
  const modes: string[] = entity.attributes.supported_color_modes ?? [];
  const turnOn = (data: object) => callAction(entity, "turn_on", data);

  return (
    <Sheet
      {...props}
      tone={on && rgb_color ? `rgb(${rgb_color.join(" ")})` : "var(--yellow)"}
      power={{ on, toggle: () => callAction(entity, "toggle") }}
    >
      {modes.some((mode) => mode !== "onoff") && (
        <Slider
          label="Brightness"
          value={on && brightness != null ? Math.round((brightness / 255) * 100) : 0}
          min={0}
          max={100}
          format={offOrPercent}
          onChange={(value) => (value === 0 ? callAction(entity, "turn_off") : turnOn({ brightness_pct: value }))}
        />
      )}
      {modes.includes("color_temp") && (
        <Slider
          label="Colour temperature"
          value={on && color_mode === "color_temp" ? color_temp_kelvin : undefined}
          min={min_color_temp_kelvin}
          max={max_color_temp_kelvin}
          step={50}
          format={(kelvin) => `${kelvin} K`}
          gradient={WARM_TO_COOL}
          onChange={(kelvin) => turnOn({ color_temp_kelvin: kelvin })}
        />
      )}
      {modes.some((mode) => COLOUR_MODES.includes(mode)) && (
        <Slider
          label="Colour"
          value={on && COLOUR_MODES.includes(color_mode) ? hs_color?.[0] : undefined}
          min={0}
          max={360}
          gradient={HUES}
          onChange={(hue) => turnOn({ hs_color: [hue, 100] })}
        />
      )}
      {supports(entity, LightFeature.EFFECT) && effect_list && (
        <Choices label="Effect" options={effect_list} value={effect} onChange={(effect) => turnOn({ effect })} />
      )}
    </Sheet>
  );
}

function SwitchDetails(props: DetailsProps) {
  const { entity } = props;
  const on = entity.state === "on";
  return (
    <Sheet {...props} tone="var(--yellow)">
      <div className="actions">
        <ActionButton icon={mdiPowerPlugOff} label="Off" selected={!on} onClick={() => callAction(entity, "turn_off")} />
        <ActionButton icon={mdiPowerPlug} label="On" selected={on} onClick={() => callAction(entity, "turn_on")} />
      </div>
    </Sheet>
  );
}

function FanDetails(props: DetailsProps) {
  const { entity } = props;
  const on = entity.state === "on";
  const { percentage, percentage_step, preset_mode, preset_modes, oscillating, direction } = entity.attributes;
  const can = (feature: number) => supports(entity, feature);

  return (
    <Sheet {...props} tone="var(--green)" power={{ on, toggle: () => callAction(entity, "toggle") }}>
      {can(FanFeature.SET_SPEED) && (
        <Slider
          label="Speed"
          // A fan running a preset may have no speed of its own.
          value={on ? (percentage ?? undefined) : 0}
          min={0}
          max={100}
          step={percentage_step ?? 1}
          format={offOrPercent}
          // Rounding down keeps 66.7% on the second of three speeds rather than the third.
          onChange={(value) => callAction(entity, "set_percentage", { percentage: Math.floor(value) })}
        />
      )}
      {can(FanFeature.PRESET_MODE) && preset_modes && (
        <Choices
          label="Mode"
          options={preset_modes}
          value={preset_mode}
          onChange={(preset_mode) => callAction(entity, "set_preset_mode", { preset_mode })}
        />
      )}
      <div className="row">
        {can(FanFeature.OSCILLATE) && (
          <Choices
            label="Oscillate"
            options={["off", "on"]}
            value={oscillating ? "on" : "off"}
            onChange={(choice) => callAction(entity, "oscillate", { oscillating: choice === "on" })}
          />
        )}
        {can(FanFeature.DIRECTION) && (
          <Choices
            label="Direction"
            options={["forward", "reverse"]}
            value={direction}
            onChange={(direction) => callAction(entity, "set_direction", { direction })}
          />
        )}
      </div>
    </Sheet>
  );
}

type SetpointProps = { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void };

function Setpoint({ label, value, onChange, ...limits }: SetpointProps) {
  const [shown, nudge] = useStepper(value, limits, onChange);
  return (
    <div className="setpoint">
      <div className="label">{label}</div>
      <div className="setpoint-row">
        <IconButton icon={mdiMinus} label="Lower" onClick={() => nudge(-1)} />
        <div className="setpoint-value">{shown}°</div>
        <IconButton icon={mdiPlus} label="Raise" onClick={() => nudge(1)} />
      </div>
    </div>
  );
}

function ClimateDetails(props: DetailsProps) {
  const { entity } = props;
  const { current_temperature, current_humidity, temperature, target_temp_low, target_temp_high } = entity.attributes;
  const { hvac_action, hvac_modes = [], preset_mode, preset_modes, fan_mode, fan_modes } = entity.attributes;
  const { min_temp = 7, max_temp = 35, target_temp_step: step = 0.5 } = entity.attributes;
  const cooling = hvac_action === "cooling" || entity.state === "cool";
  const limits = { min: min_temp, max: max_temp, step };
  const setTemperature = (data: object) => callAction(entity, "set_temperature", data);
  const reading = [
    current_temperature != null && `Now ${current_temperature}°`,
    current_humidity != null && `${Math.round(current_humidity)}% humidity`,
    hvac_action && stateLabel(hvac_action),
  ].filter(Boolean);

  return (
    <Sheet {...props} tone={cooling ? "var(--blue)" : "var(--heat)"}>
      {entity.state !== "off" && (temperature != null || target_temp_low != null) && (
        <div className="setpoints">
          {temperature != null ? (
            <Setpoint label="Target" value={temperature} {...limits} onChange={(temperature) => setTemperature({ temperature })} />
          ) : (
            <>
              <Setpoint
                label="Heat to"
                value={target_temp_low}
                {...limits}
                onChange={(low) => setTemperature({ target_temp_low: low, target_temp_high })}
              />
              <Setpoint
                label="Cool to"
                value={target_temp_high}
                {...limits}
                onChange={(high) => setTemperature({ target_temp_low, target_temp_high: high })}
              />
            </>
          )}
        </div>
      )}
      {reading.length > 0 && <div className="reading">{reading.join(" · ")}</div>}
      <Choices
        label="Mode"
        options={hvac_modes}
        value={entity.state}
        onChange={(hvac_mode) => callAction(entity, "set_hvac_mode", { hvac_mode })}
      />
      {supports(entity, ClimateFeature.PRESET_MODE) && preset_modes && (
        <Choices
          label="Preset"
          options={preset_modes}
          value={preset_mode}
          onChange={(preset_mode) => callAction(entity, "set_preset_mode", { preset_mode })}
        />
      )}
      {supports(entity, ClimateFeature.FAN_MODE) && fan_modes && (
        <Choices
          label="Fan"
          options={fan_modes}
          value={fan_mode}
          onChange={(fan_mode) => callAction(entity, "set_fan_mode", { fan_mode })}
        />
      )}
    </Sheet>
  );
}

function CoverDetails(props: DetailsProps) {
  const { entity } = props;
  const { state } = entity;
  const { current_position, current_tilt_position } = entity.attributes;
  const can = (feature: number) => supports(entity, feature);

  return (
    <Sheet {...props} tone="var(--cyan)">
      {(can(CoverFeature.OPEN) || can(CoverFeature.CLOSE)) && (
        <div className="actions">
          {can(CoverFeature.OPEN) && (
            <ActionButton
              icon={mdiArrowUp}
              label="Open"
              selected={state === "open" || state === "opening"}
              onClick={() => callAction(entity, "open_cover")}
            />
          )}
          {can(CoverFeature.STOP) && (
            <ActionButton icon={mdiStop} label="Stop" onClick={() => callAction(entity, "stop_cover")} />
          )}
          {can(CoverFeature.CLOSE) && (
            <ActionButton
              icon={mdiArrowDown}
              label="Close"
              selected={state === "closed" || state === "closing"}
              onClick={() => callAction(entity, "close_cover")}
            />
          )}
        </div>
      )}
      {can(CoverFeature.SET_POSITION) && (
        <Slider
          label="Position"
          value={current_position}
          min={0}
          max={100}
          format={(value) => (value === 0 ? "Closed" : value === 100 ? "Open" : `${value}% open`)}
          onChange={(position) => callAction(entity, "set_cover_position", { position })}
        />
      )}
      {can(CoverFeature.SET_TILT_POSITION) && (
        <Slider
          label="Tilt"
          value={current_tilt_position}
          min={0}
          max={100}
          format={percent}
          onChange={(tilt_position) => callAction(entity, "set_cover_tilt_position", { tilt_position })}
        />
      )}
    </Sheet>
  );
}

function LockDetails(props: DetailsProps) {
  const { entity } = props;
  const { state } = entity;
  return (
    <Sheet {...props} tone={state === "locked" ? "var(--green)" : "var(--red)"}>
      <div className="actions">
        <ActionButton
          icon={mdiLock}
          label="Lock"
          selected={state === "locked" || state === "locking"}
          onClick={() => callAction(entity, "lock")}
        />
        <ActionButton
          icon={mdiLockOpenVariant}
          label="Unlock"
          selected={state === "unlocked" || state === "unlocking"}
          onClick={() => callAction(entity, "unlock")}
        />
        {supports(entity, LockFeature.OPEN) && (
          <ActionButton
            icon={mdiDoorOpen}
            label="Open"
            selected={state === "open" || state === "opening"}
            onClick={() => callAction(entity, "open")}
          />
        )}
      </div>
    </Sheet>
  );
}

function MediaDetails(props: DetailsProps) {
  const { entity } = props;
  const { entity_picture, media_title, media_artist, media_series_title, media_album_name, app_name } = entity.attributes;
  const { volume_level, is_volume_muted, source, source_list } = entity.attributes;
  const can = (feature: number) => supports(entity, feature);
  const on = entity.state !== "off";
  const playing = entity.state === "playing";

  return (
    <Sheet
      {...props}
      tone="var(--magenta)"
      power={
        can(MediaFeature.TURN_ON) && can(MediaFeature.TURN_OFF)
          ? { on, toggle: () => callAction(entity, on ? "turn_off" : "turn_on") }
          : undefined
      }
    >
      {on && media_title && (
        <div className="now-playing">
          {entity_picture && (
            <img
              key={entity_picture}
              src={hassPicture(entity_picture)}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          )}
          <div className="titles">
            <div className="media-title">{media_title}</div>
            <div className="media-by">
              {[media_artist ?? media_series_title, media_album_name ?? app_name].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      )}
      {on && (
        <div className="transport">
          {can(MediaFeature.PREVIOUS_TRACK) && (
            <IconButton
              icon={mdiSkipPrevious}
              label="Previous"
              onClick={() => callAction(entity, "media_previous_track")}
            />
          )}
          {(can(MediaFeature.PAUSE) || can(MediaFeature.PLAY)) && (
            <IconButton
              className="play"
              icon={playing ? mdiPause : mdiPlay}
              label={playing ? "Pause" : "Play"}
              selected
              onClick={() => callAction(entity, "media_play_pause")}
            />
          )}
          {can(MediaFeature.NEXT_TRACK) && (
            <IconButton icon={mdiSkipNext} label="Next" onClick={() => callAction(entity, "media_next_track")} />
          )}
        </div>
      )}
      {on && can(MediaFeature.VOLUME_SET) && (
        <div className="volume">
          <Slider
            label="Volume"
            value={volume_level != null ? Math.round(volume_level * 100) : undefined}
            min={0}
            max={100}
            format={percent}
            onChange={(value) => callAction(entity, "volume_set", { volume_level: value / 100 })}
          />
          {can(MediaFeature.VOLUME_MUTE) && (
            <IconButton
              icon={is_volume_muted ? mdiVolumeOff : mdiVolumeHigh}
              label={is_volume_muted ? "Unmute" : "Mute"}
              selected={is_volume_muted}
              onClick={() => callAction(entity, "volume_mute", { is_volume_muted: !is_volume_muted })}
            />
          )}
        </div>
      )}
      {on && can(MediaFeature.SELECT_SOURCE) && source_list && (
        <Choices
          label="Source"
          options={source_list}
          value={source}
          // Sources are names the device gives, like "HDMI 1", so they're shown as they are.
          format={(name) => name}
          onChange={(source) => callAction(entity, "select_source", { source })}
        />
      )}
    </Sheet>
  );
}

const DETAILS: Record<string, (props: DetailsProps) => ReactNode> = {
  light: LightDetails,
  switch: SwitchDetails,
  fan: FanDetails,
  climate: ClimateDetails,
  cover: CoverDetails,
  lock: LockDetails,
  media_player: MediaDetails,
};

export function Details(props: DetailsProps) {
  const DomainDetails = DETAILS[props.entity.entity_id.split(".")[0]];
  if (DomainDetails) return <DomainDetails {...props} />;
  return <Sheet {...props} tone="var(--accent)" />;
}
