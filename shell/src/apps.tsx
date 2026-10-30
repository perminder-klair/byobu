// The apps behind the home screen. Each is one of a few layouts filled from Home Assistant, the
// same way a CarPlay app fills in a template.
import { mdiCalendarBlankOutline, mdiCctv, mdiHomeOutline, mdiMusicNote, mdiPaletteOutline, mdiWeatherPartlyCloudy } from "@mdi/js";
import { useState, type ReactNode } from "react";
import { eventTime, useClock } from "./clock";
import { CameraFeed, cameras, HourlyBars, WeatherLine } from "./faces";
import { entityName, useForecast, useHass, type Hass, type HassEntity } from "./hass";
import { nameInRoom, rooms, visibleEntities } from "./rooms";
import { EntityTile } from "./tiles";
import { condition, degrees, homeWeather } from "./weather";
import { Win } from "./Win";
import { Icon } from "./Icon";

const HOURS_IN_APP = 12;

export type App = { id: string; name: string; icon: string; Component: () => ReactNode };

function HomeApp() {
  const hass = useHass();
  const all = rooms(hass);
  const [selected, setSelected] = useState<string>();
  const room = all.find((candidate) => candidate.id === selected) ?? all[0];
  if (!room) return <div className="dim">Nothing to control yet.</div>;
  return (
    <div className="rooms">
      <div className="room-list scroll">
        {all.map(({ id, name }) => (
          <button key={id} aria-current={id === room.id || undefined} onClick={() => setSelected(id)}>
            {name}
          </button>
        ))}
      </div>
      <div className="tiles scroll">
        {room.entities.map((entity) => (
          <EntityTile key={entity.entity_id} entity={entity} name={nameInRoom(entity, room.id && room.name)} />
        ))}
      </div>
    </div>
  );
}

function Tiles({ entities }: { entities: HassEntity[] }) {
  return (
    <div className="tiles scroll">
      {entities.map((entity) => (
        <EntityTile key={entity.entity_id} entity={entity} name={entityName(entity)} />
      ))}
    </div>
  );
}

function MusicApp() {
  return <Tiles entities={visibleEntities(useHass(), ["media_player"])} />;
}

function ScenesApp() {
  return <Tiles entities={visibleEntities(useHass(), ["scene", "script"])} />;
}

function CalendarApp() {
  const hass = useHass();
  const clock = useClock(hass.config);
  return (
    <div className="agenda scroll">
      {hass.agenda.map((event) => (
        <div key={event.calendar + event.start + event.summary} className="agenda-row">
          <span className="when">{eventTime(event.start, clock)}</span>
          <span className="what">
            {event.summary}
            {event.location && <span className="dim"> · {event.location}</span>}
          </span>
        </div>
      ))}
      {hass.agenda.length === 0 && <div className="dim">Nothing in the next week.</div>}
    </div>
  );
}

function CamerasApp() {
  const hass = useHass();
  const feeds = cameras(hass);
  const [selected, setSelected] = useState<string>();
  const camera = feeds.find((candidate) => candidate.entity_id === selected);
  if (camera) {
    return (
      <button className="camera-full" aria-label="Back to all cameras" onClick={() => setSelected(undefined)}>
        <CameraFeed entity={camera} live />
      </button>
    );
  }
  return (
    <div className="camera-grid scroll">
      {feeds.map((feed) => (
        <button key={feed.entity_id} className="win camera" onClick={() => setSelected(feed.entity_id)}>
          <span className="win-title">{entityName(feed).toLowerCase()}</span>
          <CameraFeed entity={feed} live />
        </button>
      ))}
    </div>
  );
}

function Days({ entity, language }: { entity: HassEntity; language: string }) {
  const forecast = useForecast(entity.entity_id, "daily");
  return (
    <div className="days scroll">
      {forecast.map(({ datetime, condition: state, temperature, templow }) => (
        <div key={datetime} className="agenda-row">
          <span className="when">{new Date(datetime).toLocaleDateString(language, { weekday: "short" }).toLowerCase()}</span>
          {state && <Icon path={condition(state)[0]} />}
          <span className="what">{state && condition(state)[1]}</span>
          <span>{temperature != null && degrees(temperature)}</span>
          <span className="dim">{templow != null && degrees(templow)}</span>
        </div>
      ))}
    </div>
  );
}

function WeatherApp() {
  const hass = useHass();
  const clock = useClock(hass.config);
  const weather = homeWeather(hass);
  if (!weather) return null;
  return (
    <div className="weather-app">
      <WeatherLine entity={weather} number={1} />
      <Win title="next hours · rain" number={2} className="hourly">
        <HourlyBars entity={weather} hours={HOURS_IN_APP} language={clock.language} />
      </Win>
      <Win title="this week" number={3} className="week">
        <Days entity={weather} language={clock.language} />
      </Win>
    </div>
  );
}

// Apps with nothing to show stay off the home screen.
export function useApps(hass: Hass): App[] {
  const apps: App[] = [{ id: "home", name: "home", icon: mdiHomeOutline, Component: HomeApp }];
  if (visibleEntities(hass, ["media_player"]).length > 0) {
    apps.push({ id: "music", name: "music", icon: mdiMusicNote, Component: MusicApp });
  }
  if (Object.keys(hass.entities).some((id) => id.startsWith("calendar."))) {
    apps.push({ id: "calendar", name: "calendar", icon: mdiCalendarBlankOutline, Component: CalendarApp });
  }
  if (cameras(hass).length > 0) apps.push({ id: "cameras", name: "cameras", icon: mdiCctv, Component: CamerasApp });
  if (homeWeather(hass)) apps.push({ id: "weather", name: "weather", icon: mdiWeatherPartlyCloudy, Component: WeatherApp });
  if (visibleEntities(hass, ["scene", "script"]).length > 0) {
    apps.push({ id: "scenes", name: "scenes", icon: mdiPaletteOutline, Component: ScenesApp });
  }
  return apps;
}
