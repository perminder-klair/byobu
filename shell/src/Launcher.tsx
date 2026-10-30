// The home screen: a rail down the side that's always one tap from home, like CarPlay's, widgets
// beside it and a big grid of apps. Apps open over everything but the rail.
import { mdiViewGridOutline } from "@mdi/js";
import { useContext } from "react";
import { type App } from "./apps";
import { eventTime, useClock } from "./clock";
import { Icon } from "./Icon";
import { Nav } from "./nav";
import { activePlayer, agenda, firstWeather, locale, useStore } from "./store";
import { condition, degrees } from "./weather";
import { Win, WinButton } from "./Win";

const RECENT_APPS = 3;

type LauncherProps = {
  open: boolean;
  apps: App[];
  current?: App;
  recent: string[];
  onHome: () => void;
};

function Widgets() {
  const store = useStore();
  const clock = useClock(locale(store));
  const { openFace, openApp } = useContext(Nav);
  const player = activePlayer(store);
  const weather = firstWeather(store);
  const [next] = agenda(store);
  return (
    <div className="widgets">
      {player && (
        <WinButton title="music" number={1} className="widget" onClick={() => openFace("music")}>
          <span className="value">{player.title}</span>
          <span className="dim">{player.by}</span>
        </WinButton>
      )}
      {weather && (
        <WinButton title="weather" number={2} className="widget" onClick={() => openFace("weather")}>
          <span className="value">
            {degrees(weather.temperature)} {condition(weather.condition)[1]}
          </span>
          <span className="dim">{clock.date}</span>
        </WinButton>
      )}
      <WinButton title="next" number={3} className="widget" onClick={() => openApp("calendar")}>
        <span className="value">{next?.summary ?? "nothing coming up"}</span>
        <span className="dim">{next && eventTime(next.start, clock)}</span>
      </WinButton>
    </div>
  );
}

export function Launcher({ open, apps, current, recent, onHome }: LauncherProps) {
  const clock = useClock(locale(useStore()));
  const { openApp } = useContext(Nav);
  const recentApps = recent.flatMap((id) => apps.find((app) => app.id === id) ?? []).slice(0, RECENT_APPS);
  return (
    <div className="launcher" data-open={open || undefined}>
      <Win className="rail">
        <div className="rail-time">{clock.time}</div>
        {recentApps.map((app) => (
          <button key={app.id} aria-label={app.name} aria-current={app.id === current?.id || undefined} onClick={() => openApp(app.id)}>
            <Icon path={app.icon} />
          </button>
        ))}
        <button className="rail-home" aria-label="Home" onClick={onHome}>
          <Icon path={mdiViewGridOutline} />
        </button>
      </Win>
      <Widgets />
      <div className="apps">
        {apps.map((app) => (
          <WinButton key={app.id} className="app" onClick={() => openApp(app.id)}>
            <Icon path={app.icon} />
            {app.name}
          </WinButton>
        ))}
      </div>
      {current && (
        <Win title={current.name} focused className="app-view">
          <current.Component />
        </Win>
      )}
    </div>
  );
}
