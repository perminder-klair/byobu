// The sheet a long press opens, drawn from what the plugin sends: sliders, choices, buttons,
// setpoints and media. Nothing here knows what kind of thing it's showing.
import { mdiClose, mdiMinus, mdiPlus, mdiPower } from "@mdi/js";
import { createContext, useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ActionButton, Choices, IconButton, Slider, useStepper } from "./controls";
import {
  act,
  locale,
  useStore,
  type Action,
  type Button,
  type Placed,
  type Section,
  type Setpoint,
  type Tile,
  type Tone,
} from "./store";

// Opens the sheet for a tile.
export const ShowSheet = createContext<(tile: Placed<Tile>) => void>(() => {});

// A sheet left open closes by itself, so the panel goes back to what was under it.
const IDLE_CLOSE_MS = 30_000;

const THEME_TONES = ["accent", "red", "yellow", "green", "cyan", "blue", "magenta", "heat"];

// A theme colour by name, or any colour a plugin sent, like a light's own.
export const toneColour = (tone: Tone) => (THEME_TONES.includes(tone) ? `var(--${tone})` : tone);

type SheetFrameProps = {
  title: string;
  subtitle: string;
  tone: string;
  power?: { on: boolean; toggle: () => void };
  onClose: () => void;
  children?: ReactNode;
};

// "5 minutes ago", in the shell's language.
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
  // A long press opens the sheet under the finger, and letting go shouldn't count as a tap on it.
  const pressedOutside = useRef(false);
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
      onPointerDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget;
      }}
      onClick={(event) => pressedOutside.current && event.target === event.currentTarget && onClose()}
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

function SetpointControl({ setpoint, send }: { setpoint: Setpoint; send: (action: Action, value: number) => void }) {
  const { label, value, action, ...limits } = setpoint;
  const [shown, nudge] = useStepper(value, limits, (next) => send(action, next));
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

function MediaControls({ plugin, controls }: { plugin: string; controls: Button[] }) {
  return (
    <div className="transport">
      {controls.map(({ icon, label, selected, action }) => (
        <IconButton
          key={label}
          className={selected ? "play" : undefined}
          icon={icon}
          label={label}
          selected={selected}
          onClick={() => act(plugin, action)}
        />
      ))}
    </div>
  );
}

function SectionView({ section, plugin }: { section: Section; plugin: string }) {
  const send = (action: Action, value?: unknown) => act(plugin, action, value);
  switch (section.type) {
    case "slider": {
      const { suffix, names, action, type: _type, ...slider } = section;
      const format = (value: number) => names?.[value] ?? (suffix != null ? `${Math.round(value)}${suffix}` : "");
      return <Slider {...slider} format={format} onChange={(value) => send(action, value)} />;
    }
    case "choices":
      return (
        <Choices
          label={section.label}
          options={section.options}
          value={section.value}
          onChange={(value) => send(section.action, value)}
        />
      );
    case "buttons":
      return (
        <div className="actions">
          {section.buttons.map(({ icon, label, selected, action }) => (
            <ActionButton key={label} icon={icon} label={label} selected={selected} onClick={() => send(action)} />
          ))}
        </div>
      );
    case "setpoints":
      return (
        <>
          {section.setpoints.length > 0 && (
            <div className="setpoints">
              {section.setpoints.map((setpoint) => (
                <SetpointControl key={setpoint.label} setpoint={setpoint} send={send} />
              ))}
            </div>
          )}
          {section.reading && <div className="reading">{section.reading}</div>}
        </>
      );
    case "media":
      return (
        <>
          {section.title && (
            <div className="now-playing">
              {section.picture && (
                <img
                  key={section.picture}
                  src={section.picture}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              )}
              <div className="titles">
                <div className="media-title">{section.title}</div>
                <div className="media-by">{section.by}</div>
              </div>
            </div>
          )}
          <MediaControls plugin={plugin} controls={section.controls} />
        </>
      );
  }
}

export function TileSheet({ tile, onClose }: { tile: Placed<Tile>; onClose: () => void }) {
  const store = useStore();
  const { name, room, state, changedAt, sheet, tone, plugin } = tile;
  const when = changedAt && since(changedAt, locale(store)?.language);
  const power = sheet?.power;
  return (
    <SheetFrame
      title={name}
      subtitle={[room, state, when].filter(Boolean).join(" · ")}
      tone={toneColour(sheet?.tone ?? tone)}
      power={power && { on: power.on, toggle: () => act(plugin, power.action) }}
      onClose={onClose}
    >
      {sheet?.sections.map((section, i) => <SectionView key={i} section={section} plugin={plugin} />)}
    </SheetFrame>
  );
}
