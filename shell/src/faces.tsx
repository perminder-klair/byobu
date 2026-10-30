// The faces: what the screen shows to the room. Each has a far view, one or two windows that
// read from across the room, and a near view where more windows tile in around them. Which one
// shows is the shell's data-far attribute, and CSS does the tiling.
import {
  mdiBlindsHorizontal,
  mdiLightbulbOutline,
  mdiLock,
  mdiLockOpenVariant,
  mdiMinus,
  mdiMusic,
  mdiPause,
  mdiPlay,
  mdiPlus,
  mdiSkipNext,
  mdiSkipPrevious,
} from "@mdi/js";
import { useContext, useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Blocks } from "./Blocks";
import { eventTime, useClock, type Clock } from "./clock";
import { IconButton, useStepper } from "./controls";
import { ShowDetails } from "./Details";
import { MediaFeature } from "./features";
import {
  callAction,
  entityName,
  hassPicture,
  stateLabel,
  supports,
  useForecast,
  useHass,
  type Hass,
  type HassEntity,
} from "./hass";
import { Icon } from "./Icon";
import { Nav } from "./nav";
import { roomName, visibleEntities } from "./rooms";
import { condition, degrees, homeWeather } from "./weather";
import { Win, WinButton } from "./Win";

// Most camera integrations serve a fresh still rather than a stream to an <img>.
const CAMERA_REFRESH_MS = 5000;
const CAMERAS_ON_FACE = 4;
const HOURS_ON_FACE = 8;
const AGENDA_ON_FACE = 5;
const PROGRESS_STEPS = 28;

export type FaceProps = { visible: boolean };
export type Face = { id: string; Component: (props: FaceProps) => ReactNode };

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

function TimeWin({ clock, number }: { clock: Clock; number: number }) {
  return (
    <Win title="time" number={number} className="time">
      <Blocks text={clock.time} />
      <div className="dim">{clock.date}</div>
    </Win>
  );
}

function ClimateWin({ entity }: { entity: HassEntity }) {
  const hass = useHass();
  const showDetails = useContext(ShowDetails);
  const { current_temperature, temperature, target_temp_low, target_temp_high, hvac_action } = entity.attributes;
  const { min_temp = 7, max_temp = 35, target_temp_step: step = 0.5 } = entity.attributes;
  const [shown, nudge] = useStepper(temperature, { min: min_temp, max: max_temp, step }, (value) =>
    callAction(entity, "set_temperature", { temperature: value }),
  );
  const range = target_temp_low != null ? `${target_temp_low}-${target_temp_high}` : undefined;
  const target = shown ?? range ?? current_temperature;
  const status = [
    roomName(hass, entity.entity_id) ?? entityName(entity),
    current_temperature != null && `now ${current_temperature}°`,
    stateLabel(hvac_action ?? entity.state),
  ];
  return (
    <Win
      title="climate"
      number={1}
      focused
      className="climate"
      data-wide={shown == null || undefined}
      onClick={() => showDetails(entity.entity_id, entityName(entity))}
    >
      <Blocks text={`${target}°`} />
      <div className="dim near-only">{status.filter(Boolean).join(" · ").toLowerCase()}</div>
      {temperature != null && entity.state !== "off" && (
        <div className="steps near-only" onClick={stopPropagation}>
          <IconButton icon={mdiMinus} label="Lower" onClick={() => nudge(-1)} />
          <IconButton icon={mdiPlus} label="Raise" onClick={() => nudge(1)} />
        </div>
      )}
    </Win>
  );
}

type SummaryProps = { title: string; number: number; icon: string; tone: string; active: boolean; onClick: () => void };

function Summary({ title, number, icon, tone, active, onClick, children }: SummaryProps & { children: ReactNode }) {
  return (
    <WinButton
      title={title}
      number={number}
      className="summary"
      data-active={active || undefined}
      style={{ "--tone": tone } as CSSProperties}
      onClick={onClick}
    >
      <Icon path={icon} />
      {children}
    </WinButton>
  );
}

function Summaries({ hass }: { hass: Hass }) {
  const { openApp } = useContext(Nav);
  const showDetails = useContext(ShowDetails);
  const lights = visibleEntities(hass, ["light"]);
  const locks = visibleEntities(hass, ["lock"]);
  const covers = visibleEntities(hass, ["cover"]);
  const lit = lights.filter((light) => light.state === "on").length;
  const unlocked = locks.filter((lock) => lock.state !== "locked").length;
  const open = covers.filter((cover) => cover.state !== "closed").length;
  const home = () => openApp("home");
  const lockTap = locks.length === 1 ? () => showDetails(locks[0].entity_id, entityName(locks[0])) : home;
  return (
    <>
      {lights.length > 0 && (
        <Summary title="lights" number={4} icon={mdiLightbulbOutline} tone="var(--yellow)" active={lit > 0} onClick={home}>
          {lit} on
          <span className="dim">of {lights.length}</span>
        </Summary>
      )}
      {locks.length > 0 && (
        <Summary
          title="locks"
          number={5}
          icon={unlocked > 0 ? mdiLockOpenVariant : mdiLock}
          tone="var(--red)"
          active={unlocked > 0}
          onClick={lockTap}
        >
          {unlocked > 0 ? `${unlocked} unlocked` : "locked"}
          <span className="dim">of {locks.length}</span>
        </Summary>
      )}
      {covers.length > 0 && (
        <Summary title="blinds" number={6} icon={mdiBlindsHorizontal} tone="var(--cyan)" active={open > 0} onClick={home}>
          {open} open
          <span className="dim">of {covers.length}</span>
        </Summary>
      )}
    </>
  );
}

function Modular() {
  const hass = useHass();
  const clock = useClock(hass.config);
  const climates = visibleEntities(hass, ["climate"]);
  const climate = climates.find((entity) => entity.attributes.temperature != null && entity.state !== "off");
  const master = climate ?? climates[0];
  const [next] = hass.agenda;
  return (
    <div className="modular">
      {master ? (
        <ClimateWin entity={master} />
      ) : (
        <Win title="time" number={1} focused className="climate">
          <Blocks text={clock.time} />
        </Win>
      )}
      <TimeWin clock={clock} number={2} />
      <div className="lower near-only">
        <Win title="next" number={3} className="next-event">
          <div className="line">{next ? `${eventTime(next.start, clock)} · ${next.summary}` : "nothing coming up"}</div>
        </Win>
        <Summaries hass={hass} />
      </div>
    </div>
  );
}

export function WeatherLine({ entity, number }: { entity: HassEntity; number: number }) {
  const [icon, label] = condition(entity.state);
  return (
    <Win title="weather" number={number} className="weather-line">
      <Icon path={icon} />
      {degrees(entity.attributes.temperature)} {label}
    </Win>
  );
}

function ClockFace() {
  const hass = useHass();
  const clock = useClock(hass.config);
  const weather = homeWeather(hass);
  return (
    <div className="split">
      <Win title="clock" number={1} focused className="clock">
        <Blocks text={clock.time} />
        <div className="dim">{clock.date}</div>
      </Win>
      <div className="side near-only">
        {weather && <WeatherLine entity={weather} number={2} />}
        <Win title="agenda" number={3}>
          <div className="agenda">
            {hass.agenda.slice(0, AGENDA_ON_FACE).map((event) => (
              <div key={event.calendar + event.start + event.summary} className="agenda-row">
                <span className="when">{eventTime(event.start, clock)}</span>
                <span className="what">{event.summary}</span>
              </div>
            ))}
            {hass.agenda.length === 0 && <div className="dim">nothing coming up</div>}
          </div>
        </Win>
      </div>
    </div>
  );
}

export function HourlyBars({ entity, hours, language }: { entity: HassEntity; hours: number; language: string }) {
  const forecast = useForecast(entity.entity_id, "hourly").slice(0, hours);
  return (
    <>
      {forecast.map(({ datetime, temperature, precipitation_probability: rain }) => (
        <div key={datetime} className="hour">
          <span>{temperature != null && degrees(temperature)}</span>
          <div className="rain">
            <i style={{ height: `${rain ?? 0}%` }} />
          </div>
          <span className="dim">{new Date(datetime).toLocaleTimeString(language, { hour: "numeric" })}</span>
        </div>
      ))}
    </>
  );
}

function WeatherFace() {
  const hass = useHass();
  const clock = useClock(hass.config);
  const weather = homeWeather(hass);
  if (!weather) return null;
  const { temperature, apparent_temperature: feels, humidity } = weather.attributes;
  const details = [condition(weather.state)[1], feels != null && `feels ${degrees(feels)}`, humidity != null && `${humidity}% humidity`];
  return (
    <div className="stacked">
      <Win title="weather" number={1} focused className="weather-now">
        <Blocks text={degrees(temperature)} />
        <div className="dim">{details.filter(Boolean).join(" · ")}</div>
      </Win>
      <Win title="next hours · rain" number={2} className="hourly near-only">
        <HourlyBars entity={weather} hours={HOURS_ON_FACE} language={clock.language} />
      </Win>
    </div>
  );
}

// What's playing, or failing that paused, for the Now Playing face and widget.
export function activePlayer(hass: Hass): HassEntity | undefined {
  const players = visibleEntities(hass, ["media_player"]).filter((player) => player.attributes.media_title);
  return players.find((player) => player.state === "playing") ?? players.find((player) => player.state === "paused");
}

function usePlaybackProgress(player: HassEntity, running: boolean): number {
  const { media_position: position, media_position_updated_at: updated, media_duration: duration } = player.attributes;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!duration || position == null) return 0;
  const elapsed = running && updated ? (now - Date.parse(updated)) / 1000 : 0;
  return Math.min(1, (position + Math.max(0, elapsed)) / duration);
}

function NowPlaying({ visible }: FaceProps) {
  const hass = useHass();
  const showDetails = useContext(ShowDetails);
  const player = activePlayer(hass);
  const playing = player?.state === "playing";
  const progress = usePlaybackProgress(player ?? ({ attributes: {} } as HassEntity), playing && visible);
  if (!player) return null;
  const { entity_picture, media_title, media_artist, media_series_title, app_name } = player.attributes;
  const can = (feature: number) => supports(player, feature);
  return (
    <div className="now-playing-face">
      <Win className="artwork">
        {entity_picture ? (
          <img
            key={entity_picture}
            src={hassPicture(entity_picture)}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : (
          <Icon path={mdiMusic} />
        )}
      </Win>
      <Win title="now playing" number={1} focused className="track-info" onClick={() => showDetails(player.entity_id, entityName(player))}>
        <div className="song">{media_title}</div>
        <div className="dim">{[media_artist ?? media_series_title ?? app_name, entityName(player)].filter(Boolean).join(" · ")}</div>
        <div className="progress">
          {Array.from({ length: PROGRESS_STEPS }, (_, i) => (
            <i key={i} data-on={i < progress * PROGRESS_STEPS || undefined} />
          ))}
        </div>
        <div className="steps near-only" onClick={stopPropagation}>
          {can(MediaFeature.PREVIOUS_TRACK) && (
            <IconButton icon={mdiSkipPrevious} label="Previous" onClick={() => callAction(player, "media_previous_track")} />
          )}
          <IconButton
            icon={playing ? mdiPause : mdiPlay}
            label={playing ? "Pause" : "Play"}
            onClick={() => callAction(player, "media_play_pause")}
          />
          {can(MediaFeature.NEXT_TRACK) && (
            <IconButton icon={mdiSkipNext} label="Next" onClick={() => callAction(player, "media_next_track")} />
          )}
        </div>
      </Win>
    </div>
  );
}

export function cameras(hass: Hass): HassEntity[] {
  return visibleEntities(hass, ["camera"]);
}

export function CameraFeed({ entity, live }: { entity: HassEntity; live: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setFrame((current) => current + 1), CAMERA_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live]);
  const { entity_picture } = entity.attributes;
  return entity_picture ? <img className="feed" src={`${hassPicture(entity_picture)}&frame=${frame}`} alt="" /> : null;
}

function CamerasFace({ visible }: FaceProps) {
  const hass = useHass();
  const feeds = cameras(hass).slice(0, CAMERAS_ON_FACE);
  return (
    <div className="cameras-face" data-count={feeds.length}>
      {feeds.map((camera, i) => (
        <Win key={camera.entity_id} title={entityName(camera).toLowerCase()} number={i + 1} focused={i === 0} className="camera">
          <CameraFeed entity={camera} live={visible} />
        </Win>
      ))}
    </div>
  );
}

// Faces that would be empty stay out of the bar.
export function useFaces(hass: Hass): Face[] {
  const faces: Face[] = [
    { id: "modular", Component: Modular },
    { id: "clock", Component: ClockFace },
  ];
  if (homeWeather(hass)) faces.push({ id: "weather", Component: WeatherFace });
  if (activePlayer(hass)) faces.push({ id: "music", Component: NowPlaying });
  if (cameras(hass).length > 0) faces.push({ id: "cameras", Component: CamerasFace });
  return faces;
}
