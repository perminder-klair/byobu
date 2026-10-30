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
  mdiPaletteOutline,
  mdiPlayCircleOutline,
  mdiPlus,
  mdiPowerPlug,
  mdiPowerPlugOff,
  mdiSpeaker,
  mdiThermostat,
  mdiWindowShutter,
  mdiWindowShutterOpen,
} from "@mdi/js";
import { useContext, useRef, type CSSProperties, type ReactNode } from "react";
import { IconButton } from "./controls";
import { ShowDetails } from "./Details";
import { CoverFeature, MediaFeature } from "./features";
import { callAction, stateLabel, supports, type HassEntity } from "./hass";
import { Icon } from "./Icon";

// A press this long opens the detail sheet instead of tapping.
const HOLD_MS = 500;

// What every tile gets: the entity, and its name as it should read where it's shown.
type EntityProps = { entity: HassEntity; name: string };

type TileProps = EntityProps & {
  icon: string;
  // Icon colour and background tint while active: a theme colour, or a light's own colour.
  tone: string;
  active: boolean;
  detail: string;
  // What a tap does. Without one, a tap opens the detail sheet, which is also how anything that
  // shouldn't happen by brushing the screen, like unlocking, is done.
  onTap?: () => void;
  children?: ReactNode;
};

function Tile({ entity, name, icon, tone, active, detail, onTap, children }: TileProps) {
  const showDetails = useContext(ShowDetails);
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const unavailable = entity.state === "unavailable";
  const details = () => showDetails(entity.entity_id, name);
  const cancelHold = () => window.clearTimeout(timer.current);

  return (
    <div
      className="tile"
      role={unavailable ? undefined : "button"}
      data-active={(active && !unavailable) || undefined}
      data-unavailable={unavailable || undefined}
      style={{ "--tone": tone } as CSSProperties}
      onPointerDown={() => {
        held.current = false;
        if (unavailable) return;
        timer.current = window.setTimeout(() => {
          held.current = true;
          details();
        }, HOLD_MS);
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onClick={() => !unavailable && !held.current && (onTap ?? details)()}
    >
      <Icon path={icon} />
      {children}
      <div className="name">{name}</div>
      <div className="detail">{unavailable ? "Unavailable" : detail}</div>
    </div>
  );
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

function ClimateTile({ entity, name }: EntityProps) {
  const { current_temperature, temperature, target_temp_low, target_temp_high, hvac_action } = entity.attributes;
  const { min_temp = 7, max_temp = 35, target_temp_step: step = 0.5 } = entity.attributes;
  const cooling = hvac_action === "cooling" || entity.state === "cool";
  const target = temperature ?? (target_temp_low != null ? `${target_temp_low}–${target_temp_high}` : undefined);
  // What the device is doing right now, when it says; otherwise its mode.
  const status = stateLabel(hvac_action ?? entity.state);
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
        // Pressing these is neither a tap on the tile nor the start of a long press.
        <div className="stepper" onPointerDown={stopPropagation} onClick={stopPropagation}>
          <IconButton icon={mdiMinus} label="Lower" onClick={() => nudge(-1)} />
          <IconButton icon={mdiPlus} label="Raise" onClick={() => nudge(1)} />
        </div>
      )}
    </Tile>
  );
}

// Opening these from a stray tap would be a security problem, so a tap opens the detail sheet,
// where Open is a separate press.
const SECURE_COVERS = ["door", "garage", "gate"];

function CoverTile({ entity, name }: EntityProps) {
  const { current_position, device_class } = entity.attributes;
  const open = entity.state === "open" || entity.state === "opening";
  const secure = SECURE_COVERS.includes(device_class ?? "");
  const icons = device_class === "garage" ? [mdiGarageOpen, mdiGarage] : [mdiWindowShutterOpen, mdiWindowShutter];
  const position = entity.state === "open" && current_position != null ? ` · ${current_position}%` : "";
  // Some covers, like a pergola's louvres, only tilt.
  const toggle = supports(entity, CoverFeature.OPEN | CoverFeature.CLOSE) ? "toggle" : "toggle_cover_tilt";
  return (
    <Tile
      entity={entity}
      name={name}
      icon={open ? icons[0] : icons[1]}
      tone="var(--cyan)"
      active={open}
      detail={stateLabel(entity.state) + position}
      onTap={secure && !open ? undefined : () => callAction(entity, toggle)}
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
      detail={stateLabel(entity.state)}
      // Unlocking is done from the detail sheet, so it can't happen by brushing the screen.
      onTap={locked ? undefined : () => callAction(entity, "lock")}
    />
  );
}

function MediaTile({ entity, name }: EntityProps) {
  const { media_title, media_artist } = entity.attributes;
  const playable =
    entity.state !== "off" && (supports(entity, MediaFeature.PAUSE) || supports(entity, MediaFeature.PLAY));
  return (
    <Tile
      entity={entity}
      name={name}
      icon={mdiSpeaker}
      tone="var(--magenta)"
      active={entity.state === "playing"}
      detail={media_title ? [media_title, media_artist].filter(Boolean).join(" · ") : stateLabel(entity.state)}
      onTap={playable ? () => callAction(entity, "media_play_pause") : undefined}
    />
  );
}

function SceneTile({ entity, name }: EntityProps) {
  return (
    <Tile
      entity={entity}
      name={name}
      icon={entity.entity_id.startsWith("script.") ? mdiPlayCircleOutline : mdiPaletteOutline}
      tone="var(--accent)"
      active={false}
      detail="Tap to run"
      onTap={() => callAction(entity, "turn_on")}
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
  scene: SceneTile,
  script: SceneTile,
};

const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation();

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
      detail={stateLabel(entity.state)}
    />
  );
}
