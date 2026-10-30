// A tile: tap for what it does, and a long press for its sheet.
import { mdiMinus, mdiPlus } from "@mdi/js";
import { useContext, useRef, type CSSProperties, type MouseEvent } from "react";
import { IconButton, useStepper } from "./controls";
import { Icon } from "./Icon";
import { Nav } from "./nav";
import { ShowSheet, toneColour } from "./Sheet";
import { act, type Placed, type Stepper, type Tile } from "./store";

// A press this long opens the sheet instead of tapping.
const HOLD_MS = 500;

const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation();

function TileStepper({ stepper, plugin }: { stepper: Stepper; plugin: string }) {
  const { value, action, ...limits } = stepper;
  const [, nudge] = useStepper(value, limits, (next) => act(plugin, action, next));
  return (
    // Pressing these is neither a tap on the tile nor the start of a long press.
    <div className="stepper" onPointerDown={stopPropagation} onClick={stopPropagation as (event: MouseEvent) => void}>
      <IconButton icon={mdiMinus} label="Lower" onClick={() => nudge(-1)} />
      <IconButton icon={mdiPlus} label="Raise" onClick={() => nudge(1)} />
    </div>
  );
}

export function TileView({ tile, name }: { tile: Placed<Tile>; name?: string }) {
  const showSheet = useContext(ShowSheet);
  const { openApp } = useContext(Nav);
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const { unavailable, active, tone, icon, detail, tap, link, stepper, plugin } = tile;
  const cancelHold = () => window.clearTimeout(timer.current);
  const press = () => {
    if (link) openApp(link.slice("app:".length));
    else if (tap) act(plugin, tap);
    else showSheet(tile);
  };

  return (
    <div
      className="tile"
      role={unavailable ? undefined : "button"}
      data-active={(active && !unavailable) || undefined}
      data-unavailable={unavailable || undefined}
      style={{ "--tone": toneColour(tone) } as CSSProperties}
      onPointerDown={() => {
        held.current = false;
        if (unavailable) return;
        timer.current = window.setTimeout(() => {
          held.current = true;
          showSheet(tile);
        }, HOLD_MS);
      }}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      // Phones have a long press of their own, which can get in before the timer and cancel it.
      onContextMenu={() => {
        cancelHold();
        if (unavailable || held.current) return;
        held.current = true;
        showSheet(tile);
      }}
      onClick={() => !unavailable && !held.current && press()}
    >
      <Icon path={icon} />
      {stepper && !unavailable && <TileStepper stepper={stepper} plugin={plugin} />}
      <div className="name">{name ?? tile.name}</div>
      <div className="detail">{unavailable ? "Unavailable" : detail}</div>
    </div>
  );
}
