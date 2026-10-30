// Timers. Each draws its own countdown from when it ends, so byobud needn't say every second.
import { mdiTimerOutline } from "@mdi/js";
import { useContext, useEffect, useState } from "react";
import { ActionButton } from "./controls";
import { Icon } from "./Icon";
import { Nav } from "./nav";
import { act, allTiles, timers, useStore, type Placed, type Timer } from "./store";
import { TileView } from "./tiles";
import { Win } from "./Win";

export function left(endsAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`;
}

export function Countdown({ timer }: { timer: Timer }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);
  return <>{left(timer.endsAt, now)}</>;
}

export function TimerBadge({ timer }: { timer: Timer }) {
  const { openApp } = useContext(Nav);
  return (
    <button className="timer-badge" aria-label="Open timers" onClick={() => openApp("timers")}>
      <Icon path={mdiTimerOutline} />
      <Countdown timer={timer} />
    </button>
  );
}

function Running({ timer, number }: { timer: Placed<Timer>; number: number }) {
  return (
    <Win title={timer.label} number={number} focused className="running-timer">
      <div className="timer-left">
        <Countdown timer={timer} />
      </div>
      <div className="actions">
        {timer.actions.map(({ icon, label, action }) => (
          <ActionButton key={label} icon={icon} label={label} onClick={() => act(timer.plugin, action)} />
        ))}
      </div>
    </Win>
  );
}

export function TimersApp() {
  const store = useStore();
  const running = timers(store);
  return (
    <div className="timers-app scroll">
      {running.length > 0 && (
        <div className="running">
          {running.map((timer, i) => (
            <Running key={timer.id} timer={timer} number={i + 1} />
          ))}
        </div>
      )}
      <div className="tiles">
        {allTiles(store)
          .filter(({ kind }) => kind === "timer")
          .map((tile) => (
            <TileView key={tile.id} tile={tile} />
          ))}
      </div>
    </div>
  );
}
