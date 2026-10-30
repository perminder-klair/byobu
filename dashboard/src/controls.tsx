// Touch controls for the detail sheet, sized for a finger on a wall.
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { stateLabel } from "./hass";
import { Icon } from "./Icon";

// How long a picked value stays on screen if Home Assistant never reports it back, say because
// the device ignored it.
const PICKED_MS = 5000;

// A value the user just picked, shown in place of Home Assistant's until Home Assistant reports
// a change. Without it, a slider jumps back to the old value between letting go and the device
// catching up.
export function usePicked(actual: number | undefined) {
  const [picked, setPicked] = useState<{ value: number; over?: number }>();
  const timer = useRef<number | undefined>(undefined);
  const shown = picked && picked.over === actual ? picked.value : actual;
  const pick = (value: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPicked(undefined), PICKED_MS);
    setPicked({ value, over: actual });
  };
  return [shown, pick] as const;
}

type SliderProps = {
  label: string;
  // Home Assistant's value. Undefined when it has none, like a light's colour while it's white.
  value?: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  // Called when the finger lifts rather than on every move, so a drag is one change for the device.
  onChange: (value: number) => void;
  // A gradient to pick a point on, like colour temperature, instead of a bar that fills up.
  gradient?: string;
};

export function Slider({ label, value, min, max, step = 1, format, onChange, gradient }: SliderProps) {
  const [shown, pick] = usePicked(value);
  const dragging = useRef(false);
  // Wherever the finger is, not how far it moved, so a tap sets a value too.
  const at = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    return Math.min(max, min + Math.round((fraction * (max - min)) / step) * step);
  };

  return (
    <div className="slider">
      <div className="label">
        <span>{label}</span>
        {shown != null && format && <span>{format(shown)}</span>}
      </div>
      <div
        className="track"
        style={{ "--at": shown == null ? 0 : (shown - min) / (max - min), background: gradient } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          pick(at(event));
        }}
        onPointerMove={(event) => dragging.current && pick(at(event))}
        onPointerUp={(event) => {
          if (!dragging.current) return;
          dragging.current = false;
          const picked = at(event);
          pick(picked);
          onChange(picked);
        }}
        onPointerCancel={() => (dragging.current = false)}
      >
        {gradient ? shown != null && <div className="marker" /> : <div className="fill" />}
      </div>
    </div>
  );
}

type ChoicesProps = {
  label: string;
  options: string[];
  value?: string | null;
  format?: (option: string) => string;
  onChange: (option: string) => void;
};

// One of a few named options, like a thermostat's mode.
export function Choices({ label, options, value, format = stateLabel, onChange }: ChoicesProps) {
  return (
    <div className="choices">
      <div className="label">{label}</div>
      <div className="options">
        {options.map((option) => (
          <button
            key={option}
            className="chip"
            data-selected={option === value || undefined}
            onClick={() => onChange(option)}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

type ButtonProps = { icon: string; label: string; selected?: boolean; className?: string; onClick: () => void };

// A wide button with a word on it, for things like Lock and Unlock. Selected shows the state
// the device is in.
export function ActionButton({ icon, label, selected, onClick }: ButtonProps) {
  return (
    <button className="action" data-selected={selected || undefined} onClick={onClick}>
      <Icon path={icon} />
      {label}
    </button>
  );
}

// A round icon button. The label is for screen readers.
export function RoundButton({ icon, label, selected, className, onClick }: ButtonProps) {
  return (
    <button
      className={className ? `round ${className}` : "round"}
      aria-label={label}
      data-selected={selected || undefined}
      onClick={onClick}
    >
      <Icon path={icon} />
    </button>
  );
}
