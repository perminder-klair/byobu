import {
  mdiFan,
  mdiFanOff,
  mdiGarage,
  mdiGarageOpen,
  mdiHelpCircleOutline,
  mdiLightbulb,
  mdiLightbulbOutline,
  mdiLock,
  mdiLockOpenVariant,
  mdiMinus,
  mdiPlus,
  mdiPowerPlug,
  mdiPowerPlugOff,
  mdiSpeaker,
  mdiThermostat,
  mdiWindowShutter,
  mdiWindowShutterOpen,
} from "@mdi/js";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { callAction, type HassEntity } from "./hass";
import { Icon } from "./Icon";

const HOLD_MS = 600;

// What every tile gets: the entity, and its name as it should read where it's shown.
type EntityProps = { entity: HassEntity; name: string };

type TileProps = EntityProps & {
  icon: string;
  // Icon colour and background tint while active: a theme colour, or a light's own colour.
  tone: string;
  active: boolean;
  detail: string;
  onTap?: () => void;
  // A long press, for things that shouldn't happen by brushing the screen, like unlocking.
  onHold?: () => void;
  children?: ReactNode;
};

function Tile({ entity, name, icon, tone, active, detail, onTap, onHold, children }: TileProps) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const unavailable = entity.state === "unavailable";
  const pressable = (onTap || onHold) && !unavailable;
  const cancelHold = () => window.clearTimeout(timer.current);

  return (
    <div
      className="tile"
      role={pressable ? "button" : undefined}
      data-active={(active && !unavailable) || undefined}
      data-unavailable={unavailable || undefined}
      style={{ "--tone": tone } as CSSProperties}
      onPointerDown={() => {
        held.current = false;
        if (pressable && onHold) {
          timer.current = window.setTimeout(() => {
            held.current = true;
            onHold();
          }, HOLD_MS);
        }
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onClick={() => pressable && !held.current && onTap?.()}
    >
      <Icon path={icon} />
      {children}
      <div className="name">{name}</div>
      <div className="detail">{unavailable ? "Unavailable" : detail}</div>
    </div>
  );
}

function label(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1).replaceAll("_", " ");
}

function LightTile({ entity, name }: EntityProps) {
  const on = entity.state === "on";
  const { brightness, rgb_color } = entity.attributes;
  return (
    <Tile
      entity={entity}
      name={name}
      icon={on ? mdiLightbulb : mdiLightbulbOutline}
      tone={on && rgb_color ? `rgb(${rgb_color.join(" ")})` : "var(--yellow)"}
      active={on}
      detail={on ? (brightness != null ? `${Math.round((brightness / 255) * 100)}%` : "On") : "Off"}
      onTap={() => callAction(entity, "toggle")}
    />
  );
}

function SwitchTile({ entity, name }: EntityProps) {
  const on = entity.state === "on";
  return (
    <Tile
      entity={entity}
      name={name}
      icon={on ? mdiPowerPlug : mdiPowerPlugOff}
      tone="var(--yellow)"
      active={on}
      detail={on ? "On" : "Off"}
      onTap={() => callAction(entity, "toggle")}
    />
  );
}

function FanTile({ entity, name }: EntityProps) {
  const on = entity.state === "on";
  const { percentage } = entity.attributes;
  return (
    <Tile
      entity={entity}
      name={name}
      icon={on ? mdiFan : mdiFanOff}
      tone="var(--green)"
      active={on}
      detail={on ? (percentage != null ? `${percentage}%` : "On") : "Off"}
      onTap={() => callAction(entity, "toggle")}
    />
  );
}

// What the device is doing right now, when it says; otherwise its mode.
const HVAC_STATUS: Record<string, string> = {
  heating: "Heating",
  cooling: "Cooling",
  drying: "Drying",
  fan: "Fan",
  idle: "Idle",
  off: "Off",
  heat_cool: "Heat/cool",
  fan_only: "Fan only",
};

function ClimateTile({ entity, name }: EntityProps) {
  const { current_temperature, temperature, target_temp_low, target_temp_high, hvac_action } = entity.attributes;
  const { min_temp = 7, max_temp = 35, target_temp_step: step = 0.5 } = entity.attributes;
  const cooling = hvac_action === "cooling" || entity.state === "cool";
  const target = temperature ?? (target_temp_low != null ? `${target_temp_low}–${target_temp_high}` : undefined);
  const status = HVAC_STATUS[hvac_action ?? entity.state] ?? label(entity.state);
  const nudge = (direction: number) => {
    const next = Math.min(max_temp, Math.max(min_temp, temperature + direction * step));
    callAction(entity, "set_temperature", { temperature: Number(next.toFixed(1)) });
  };

  return (
    <Tile
      entity={entity}
      name={name}
      icon={mdiThermostat}
      tone={cooling ? "var(--blue)" : "var(--heat)"}
      active={entity.state !== "off"}
      detail={[current_temperature != null && `${current_temperature}°`, target != null && `set ${target}°`, status]
        .filter(Boolean)
        .join(" · ")}
    >
      {temperature != null && entity.state !== "off" && (
        <div className="stepper">
          <button aria-label="Lower" onClick={() => nudge(-1)}>
            <Icon path={mdiMinus} />
          </button>
          <button aria-label="Raise" onClick={() => nudge(1)}>
            <Icon path={mdiPlus} />
          </button>
        </div>
      )}
    </Tile>
  );
}

// Opening these from a stray tap would be a security problem, so they take a long press.
const SECURE_COVERS = ["door", "garage", "gate"];

function CoverTile({ entity, name }: EntityProps) {
  const { current_position, device_class } = entity.attributes;
  const open = entity.state === "open" || entity.state === "opening";
  const secure = SECURE_COVERS.includes(device_class ?? "");
  const icons = device_class === "garage" ? [mdiGarageOpen, mdiGarage] : [mdiWindowShutterOpen, mdiWindowShutter];
  const position = entity.state === "open" && current_position != null ? ` · ${current_position}%` : "";
  return (
    <Tile
      entity={entity}
      name={name}
      icon={open ? icons[0] : icons[1]}
      tone="var(--cyan)"
      active={open}
      detail={label(entity.state) + position + (secure && !open ? " · hold to open" : "")}
      onTap={secure && !open ? undefined : () => callAction(entity, "toggle")}
      onHold={secure && !open ? () => callAction(entity, "open_cover") : undefined}
    />
  );
}

function LockTile({ entity, name }: EntityProps) {
  const locked = entity.state === "locked";
  return (
    <Tile
      entity={entity}
      name={name}
      icon={locked ? mdiLock : mdiLockOpenVariant}
      tone="var(--red)"
      active={!locked}
      detail={locked ? "Locked · hold to unlock" : label(entity.state)}
      onTap={locked ? undefined : () => callAction(entity, "lock")}
      onHold={locked ? () => callAction(entity, "unlock") : undefined}
    />
  );
}

function MediaTile({ entity, name }: EntityProps) {
  const { media_title, media_artist } = entity.attributes;
  return (
    <Tile
      entity={entity}
      name={name}
      icon={mdiSpeaker}
      tone="var(--magenta)"
      active={entity.state === "playing"}
      detail={media_title ? [media_title, media_artist].filter(Boolean).join(" · ") : label(entity.state)}
      onTap={entity.state === "off" ? undefined : () => callAction(entity, "media_play_pause")}
    />
  );
}

const TILES: Record<string, (props: EntityProps) => ReactNode> = {
  light: LightTile,
  switch: SwitchTile,
  fan: FanTile,
  climate: ClimateTile,
  cover: CoverTile,
  lock: LockTile,
  media_player: MediaTile,
};

export function EntityTile({ entity, name }: EntityProps) {
  const DomainTile = TILES[entity.entity_id.split(".")[0]];
  if (DomainTile) return <DomainTile entity={entity} name={name} />;
  return (
    <Tile
      entity={entity}
      name={name}
      icon={mdiHelpCircleOutline}
      tone="var(--accent)"
      active={false}
      detail={label(entity.state)}
    />
  );
}
