// The faces: what the screen shows to the room. Each has a far view, one or two windows that
// read from across the room, and a near view where more windows tile in around them. Which one
// shows is the shell's data-far attribute, and CSS does the tiling.
import { mdiMinus, mdiMusic, mdiPlus } from "@mdi/js";
import { useContext, useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Blocks } from "./Blocks";
import { eventTime, useClock, type Clock } from "./clock";
import { IconButton, useStepper } from "./controls";
import { Icon } from "./Icon";
import { Nav } from "./nav";
import { ShowSheet, toneColour } from "./Sheet";
import {
  act,
  activePlayer,
  agenda,
  allTiles,
  cameras,
  firstWeather,
  locale,
  useStore,
  type Camera,
  type Placed,
  type Player,
  type Store,
  type Tile,
  type Weather,
} from "./store";
import { condition, degrees } from "./weather";
import { Win, WinButton } from "./Win";

const CAMERA_REFRESH_MS = 5000;
const CAMERAS_ON_FACE = 4;
const HOURS_ON_FACE = 8;
const AGENDA_ON_FACE = 5;
const PROGRESS_STEPS = 28;
const SUMMARIES = 3;

export type FaceProps = { visible: boolean };
export type Face = { id: string; name: string; Component: (props: FaceProps) => ReactNode };

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

function TimeWin({ clock, number }: { clock: Clock; number: number }) {
  return (
    <Win title="time" number={number} className="time">
      <Blocks text={clock.time} />
      <div className="dim">{clock.date}</div>
    </Win>
  );
}

function MainTile({ tile }: { tile: Placed<Tile> }) {
  const showSheet = useContext(ShowSheet);
  const { stepper, value, plugin } = tile;
  const [shown, nudge] = useStepper(stepper?.value, stepper ?? { min: 0, max: 0, step: 0 }, (next) =>
    stepper && act(plugin, stepper.action, next),
  );
  const big = shown ?? value ?? "";
  return (
    <Win
      title={tile.name.toLowerCase()}
      number={1}
      focused
      className="climate"
      data-wide={String(big).length > 5 || undefined}
      onClick={() => showSheet(tile)}
    >
      <Blocks text={`${big}°`} />
      <div className="dim near-only">{[tile.room, tile.detail].filter(Boolean).join(" · ").toLowerCase()}</div>
      {stepper && (
        <div className="steps near-only" onClick={stopPropagation}>
          <IconButton icon={mdiMinus} label="Lower" onClick={() => nudge(-1)} />
          <IconButton icon={mdiPlus} label="Raise" onClick={() => nudge(1)} />
        </div>
      )}
    </Win>
  );
}

function Summary({ tile, number }: { tile: Placed<Tile>; number: number }) {
  const { openApp } = useContext(Nav);
  const showSheet = useContext(ShowSheet);
  return (
    <WinButton
      title={tile.name.toLowerCase()}
      number={number}
      className="summary"
      data-active={tile.active || undefined}
      style={{ "--tone": toneColour(tile.tone) } as CSSProperties}
      onClick={() => {
        if (tile.link) openApp(tile.link.slice("app:".length));
        else if (tile.tap) act(tile.plugin, tile.tap);
        else showSheet(tile);
      }}
    >
      <Icon path={tile.icon} />
      {tile.value ?? tile.detail}
      {tile.value && <span className="dim">{tile.detail}</span>}
    </WinButton>
  );
}

// What Modular shows: the choices in Settings, or failing those, the first thing with a big
// number and the plugins' own summaries.
export function modularTiles(store: Store) {
  const tiles = allTiles(store);
  const { main: mainId = "", tiles: smallIds = [] } = store.snapshot?.panel.modular ?? {};
  const bigs = tiles.filter(({ value, kind }) => value != null && kind !== "summary");
  const main = tiles.find(({ id }) => id === mainId) ?? bigs.find(({ stepper }) => stepper) ?? bigs[0];
  const chosen = smallIds.flatMap((id) => tiles.find((tile) => tile.id === id) ?? []);
  const small = chosen.length > 0 ? chosen : tiles.filter(({ kind }) => kind === "summary");
  return { main, small: small.slice(0, SUMMARIES) };
}

function Modular() {
  const store = useStore();
  const clock = useClock(locale(store));
  const { main, small } = modularTiles(store);
  const weather = firstWeather(store);
  const [next] = agenda(store);
  return (
    <div className="modular">
      {main ? (
        <MainTile tile={main} />
      ) : weather ? (
        <Win title="weather" number={1} focused className="climate">
          <Blocks text={degrees(weather.temperature)} />
          <div className="dim near-only">{condition(weather.condition)[1]}</div>
        </Win>
      ) : (
        <Win title="next" number={1} focused className="climate">
          <div className="dim">{next?.summary ?? "nothing coming up"}</div>
        </Win>
      )}
      <TimeWin clock={clock} number={2} />
      <div className="lower near-only">
        <Win title="next" number={3} className="next-event">
          <div className="line">{next ? `${eventTime(next.start, clock)} · ${next.summary}` : "nothing coming up"}</div>
        </Win>
        {small.map((tile, i) => (
          <Summary key={tile.id} tile={tile} number={i + 4} />
        ))}
      </div>
    </div>
  );
}

export function WeatherLine({ weather, number }: { weather: Weather; number: number }) {
  const [icon, label] = condition(weather.condition);
  return (
    <Win title="weather" number={number} className="weather-line">
      <Icon path={icon} />
      {degrees(weather.temperature)} {label}
    </Win>
  );
}

function ClockFace() {
  const store = useStore();
  const clock = useClock(locale(store));
  const weather = firstWeather(store);
  const events = agenda(store);
  return (
    <div className="split">
      <Win title="clock" number={1} focused className="clock">
        <Blocks text={clock.time} />
        <div className="dim">{clock.date}</div>
      </Win>
      <div className="side near-only">
        {weather && <WeatherLine weather={weather} number={2} />}
        <Win title="agenda" number={3}>
          <div className="agenda">
            {events.slice(0, AGENDA_ON_FACE).map((event) => (
              <div key={event.id} className="agenda-row">
                <span className="when">{eventTime(event.start, clock)}</span>
                <span className="what">{event.summary}</span>
              </div>
            ))}
            {events.length === 0 && <div className="dim">nothing coming up</div>}
          </div>
        </Win>
      </div>
    </div>
  );
}

export function HourlyBars({ weather, hours, language }: { weather: Weather; hours: number; language: string }) {
  return (
    <>
      {weather.hourly.slice(0, hours).map(({ time, temperature, rainChance }) => (
        <div key={time} className="hour">
          <span>{temperature != null && degrees(temperature)}</span>
          <div className="rain">
            <i style={{ height: `${rainChance ?? 0}%` }} />
          </div>
          <span className="dim">{new Date(time).toLocaleTimeString(language, { hour: "numeric" })}</span>
        </div>
      ))}
    </>
  );
}

function WeatherFace() {
  const store = useStore();
  const clock = useClock(locale(store));
  const weather = firstWeather(store);
  if (!weather) return null;
  const { feelsLike, humidity } = weather;
  const details = [condition(weather.condition)[1], feelsLike != null && `feels ${degrees(feelsLike)}`, humidity != null && `${humidity}% humidity`];
  return (
    <div className="stacked">
      <Win title="weather" number={1} focused className="weather-now">
        <Blocks text={degrees(weather.temperature)} />
        <div className="dim">{details.filter(Boolean).join(" · ")}</div>
      </Win>
      <Win title="next hours · rain" number={2} className="hourly near-only">
        <HourlyBars weather={weather} hours={HOURS_ON_FACE} language={clock.language} />
      </Win>
    </div>
  );
}

function usePlaybackProgress(player: Player | undefined, running: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const { position, positionAt, duration } = player ?? {};
  if (!duration || position == null) return 0;
  const elapsed = running && positionAt ? (now - Date.parse(positionAt)) / 1000 : 0;
  return Math.min(1, (position + Math.max(0, elapsed)) / duration);
}

function NowPlaying({ visible }: FaceProps) {
  const store = useStore();
  const showSheet = useContext(ShowSheet);
  const player = activePlayer(store);
  const progress = usePlaybackProgress(player, player?.state === "playing" && visible);
  if (!player) return null;
  const tile = player.tile ? allTiles(store).find(({ id }) => id === player.tile) : undefined;
  return (
    <div className="now-playing-face">
      <Win className="artwork">
        {player.picture ? (
          <img
            key={player.picture}
            src={player.picture}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : (
          <Icon path={mdiMusic} />
        )}
      </Win>
      <Win title="now playing" number={1} focused className="track-info" onClick={() => tile && showSheet(tile)}>
        <div className="song">{player.title}</div>
        <div className="dim">{[player.by, player.name].filter(Boolean).join(" · ")}</div>
        <div className="progress">
          {Array.from({ length: PROGRESS_STEPS }, (_, i) => (
            <i key={i} data-on={i < progress * PROGRESS_STEPS || undefined} />
          ))}
        </div>
        <div className="steps near-only" onClick={stopPropagation}>
          {player.controls.map(({ icon, label, action }) => (
            <IconButton key={label} icon={icon} label={label} onClick={() => act(player.plugin, action)} />
          ))}
        </div>
      </Win>
    </div>
  );
}

export function CameraFeed({ camera, live }: { camera: Camera; live: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setFrame((current) => current + 1), CAMERA_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live]);
  return <img className="feed" src={`${camera.picture}?frame=${frame}`} alt="" />;
}

function CamerasFace({ visible }: FaceProps) {
  const store = useStore();
  const feeds = cameras(store).slice(0, CAMERAS_ON_FACE);
  return (
    <div className="cameras-face" data-count={feeds.length}>
      {feeds.map((camera, i) => (
        <Win key={camera.id} title={camera.name.toLowerCase()} number={i + 1} focused={i === 0} className="camera">
          <CameraFeed camera={camera} live={visible} />
        </Win>
      ))}
    </div>
  );
}

const FACES: Face[] = [
  { id: "modular", name: "Modular", Component: Modular },
  { id: "clock", name: "Clock", Component: ClockFace },
  { id: "weather", name: "Weather", Component: WeatherFace },
  { id: "music", name: "Now Playing", Component: NowPlaying },
  { id: "cameras", name: "Cameras", Component: CamerasFace },
];

export const faceChoices = FACES.map(({ id, name }) => ({ id, name }));

// The faces chosen in Settings, leaving out any that would be empty, so they stay off the bar.
export function useFaces(store: Store): Face[] {
  const chosen = store.snapshot?.panel.faces ?? FACES.map(({ id }) => id);
  const hasContent: Record<string, boolean> = {
    weather: !!firstWeather(store),
    music: !!activePlayer(store),
    cameras: cameras(store).length > 0,
  };
  const shown = chosen.flatMap((id) => FACES.find((face) => face.id === id) ?? []).filter(({ id }) => hasContent[id] ?? true);
  return shown.length > 0 ? shown : FACES.slice(1, 2);
}
