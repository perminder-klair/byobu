// The apps behind the home screen. Each is one of a few layouts filled from what plugins publish,
// the same way a CarPlay app fills in a template.
import { mdiCalendarBlankOutline, mdiCctv, mdiCogOutline, mdiHomeOutline, mdiMusicNote, mdiPaletteOutline, mdiTimerOutline, mdiWeatherPartlyCloudy } from "@mdi/js";
import { useState, type ReactNode } from "react";
import { eventTime, useClock } from "./clock";
import { CameraFeed, HourlyBars, WeatherLine } from "./faces";
import { Icon } from "./Icon";
import { SettingsApp } from "./settings";
import { agenda, allTiles, cameras, firstWeather, locale, rooms, useStore, type Placed, type Store, type Tile, type Weather } from "./store";
import { TileView } from "./tiles";
import { TimersApp } from "./timers";
import { condition, degrees } from "./weather";
import { Win } from "./Win";

const HOURS_IN_APP = 12;

export type App = { id: string; name: string; icon: string; Component: () => ReactNode };

export function HomeApp() {
  const store = useStore();
  const all = rooms(store);
  const [selected, setSelected] = useState<string>();
  const room = all.find(({ name }) => name === selected) ?? all[0];
  if (!room) return <div className="dim">Nothing to control yet. Add Home Assistant in Settings.</div>;
  return (
    <div className="rooms">
      <div className="room-list scroll">
        {all.map(({ name }) => (
          <button key={name} aria-current={name === room.name || undefined} onClick={() => setSelected(name)}>
            {name}
          </button>
        ))}
      </div>
      <div className="tiles scroll">
        {room.tiles.map((tile) => (
          <TileView key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function Tiles({ tiles }: { tiles: Placed<Tile>[] }) {
  return (
    <div className="tiles scroll">
      {tiles.map((tile) => (
        <TileView key={tile.id} tile={tile} />
      ))}
    </div>
  );
}

function MusicApp() {
  return <Tiles tiles={allTiles(useStore()).filter(({ kind }) => kind === "media")} />;
}

function ScenesApp() {
  return <Tiles tiles={allTiles(useStore()).filter(({ kind }) => kind === "scene")} />;
}

function CalendarApp() {
  const store = useStore();
  const clock = useClock(locale(store));
  const events = agenda(store);
  return (
    <div className="agenda scroll">
      {events.map((event) => (
        <div key={event.id} className="agenda-row">
          <span className="when">{eventTime(event.start, clock)}</span>
          <span className="what">
            {event.summary}
            {event.location && <span className="dim"> · {event.location}</span>}
          </span>
        </div>
      ))}
      {events.length === 0 && <div className="dim">Nothing in the next week.</div>}
    </div>
  );
}

function CamerasApp() {
  const feeds = cameras(useStore());
  const [selected, setSelected] = useState<string>();
  const camera = feeds.find(({ id }) => id === selected);
  if (camera) {
    return (
      <button className="camera-full" aria-label="Back to all cameras" onClick={() => setSelected(undefined)}>
        <CameraFeed camera={camera} live />
      </button>
    );
  }
  return (
    <div className="camera-grid scroll">
      {feeds.map((feed) => (
        <button key={feed.id} className="win camera" onClick={() => setSelected(feed.id)}>
          <span className="win-title">{feed.name.toLowerCase()}</span>
          <CameraFeed camera={feed} live />
        </button>
      ))}
    </div>
  );
}

function Days({ weather, language }: { weather: Weather; language: string }) {
  return (
    <div className="days scroll">
      {weather.daily.map(({ time, condition: state, temperature, low }) => (
        <div key={time} className="agenda-row">
          <span className="when">{new Date(time).toLocaleDateString(language, { weekday: "short" }).toLowerCase()}</span>
          {state && <Icon path={condition(state)[0]} />}
          <span className="what">{state && condition(state)[1]}</span>
          <span>{temperature != null && degrees(temperature)}</span>
          <span className="dim">{low != null && degrees(low)}</span>
        </div>
      ))}
    </div>
  );
}

function WeatherApp() {
  const store = useStore();
  const clock = useClock(locale(store));
  const weather = firstWeather(store);
  if (!weather) return null;
  return (
    <div className="weather-app">
      <WeatherLine weather={weather} number={1} />
      <Win title="next hours · rain" number={2} className="hourly">
        <HourlyBars weather={weather} hours={HOURS_IN_APP} language={clock.language} />
      </Win>
      <Win title="this week" number={3} className="week">
        <Days weather={weather} language={clock.language} />
      </Win>
    </div>
  );
}

// Apps with nothing to show stay off the home screen. Settings is always there.
export function useApps(store: Store): App[] {
  const tiles = allTiles(store);
  const apps: App[] = [];
  if (rooms(store).length > 0) apps.push({ id: "home", name: "home", icon: mdiHomeOutline, Component: HomeApp });
  if (tiles.some(({ kind }) => kind === "media")) apps.push({ id: "music", name: "music", icon: mdiMusicNote, Component: MusicApp });
  if (agenda(store).length > 0) apps.push({ id: "calendar", name: "calendar", icon: mdiCalendarBlankOutline, Component: CalendarApp });
  if (cameras(store).length > 0) apps.push({ id: "cameras", name: "cameras", icon: mdiCctv, Component: CamerasApp });
  if (tiles.some(({ kind }) => kind === "timer")) apps.push({ id: "timers", name: "timers", icon: mdiTimerOutline, Component: TimersApp });
  if (firstWeather(store)) apps.push({ id: "weather", name: "weather", icon: mdiWeatherPartlyCloudy, Component: WeatherApp });
  if (tiles.some(({ kind }) => kind === "scene")) apps.push({ id: "scenes", name: "scenes", icon: mdiPaletteOutline, Component: ScenesApp });
  apps.push({ id: "settings", name: "settings", icon: mdiCogOutline, Component: SettingsApp });
  return apps;
}
