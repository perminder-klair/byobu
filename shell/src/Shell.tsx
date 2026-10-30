// The whole screen: the bar, the faces you swipe between, and the home screen you swipe up to.
// Swipes are native scrolling with snap points, which the GPU runs by itself. A drag handled in
// JavaScript would need the main thread for every frame.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApps } from "./apps";
import { Bar } from "./Bar";
import { Choices, Slider } from "./controls";
import { Details, SheetFrame, ShowDetails } from "./Details";
import { activePlayer, useFaces } from "./faces";
import { useHass, type Hass } from "./hass";
import { Launcher } from "./Launcher";
import { Nav } from "./nav";
import { updateSettings, usePower, wake, type PanelSettings } from "./power";
import { roomName } from "./rooms";

function statusMessage({ status, error }: Hass): string {
  if (status === "failed") return `Can't reach Home Assistant: ${error}`;
  if (status === "reconnecting") return "Reconnecting to Home Assistant…";
  return "Connecting to Home Assistant…";
}

const SLEEP_OPTIONS = ["15", "30", "60", "0"];
const NIGHT_OPTIONS: PanelSettings["night"][] = ["auto", "on", "off"];

function PanelSheet({ onClose }: { onClose: () => void }) {
  const { settings } = usePower();
  return (
    <SheetFrame title="Panel" subtitle="This screen" tone="var(--accent)" onClose={onClose}>
      <Slider
        label="Brightness"
        value={settings.brightness}
        min={5}
        max={100}
        step={5}
        format={(value) => `${value}%`}
        onChange={(brightness) => updateSettings({ brightness })}
      />
      <Choices
        label="Night mode"
        options={NIGHT_OPTIONS}
        value={settings.night}
        format={(option) => (option === "auto" ? "22:00 to 07:00" : option === "on" ? "On" : "Off")}
        onChange={(night) => updateSettings({ night: night as PanelSettings["night"] })}
      />
      <Choices
        label="Turn the screen off after"
        options={SLEEP_OPTIONS}
        value={String(settings.blankAfter)}
        format={(minutes) => (minutes === "0" ? "Never" : `${minutes} minutes`)}
        onChange={(minutes) => updateSettings({ blankAfter: Number(minutes) })}
      />
    </SheetFrame>
  );
}

export function Shell() {
  const hass = useHass();
  const power = usePower();
  const faces = useFaces(hass);
  const apps = useApps(hass);
  const [faceId, setFaceId] = useState("modular");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [appId, setAppId] = useState<string>();
  const [recent, setRecent] = useState<string[]>([]);
  const [details, setDetails] = useState<{ entityId: string; name: string }>();
  const [panelSheet, setPanelSheet] = useState(false);

  // A face can disappear, like Now Playing when the music stops.
  const face = Math.max(0, faces.findIndex(({ id }) => id === faceId));
  const app = launcherOpen ? apps.find(({ id }) => id === appId) : undefined;
  const far = power.state !== "near";
  const detailed = details && hass.entities[details.entityId];

  const stage = useRef<HTMLDivElement>(null);
  const pages = useRef<HTMLDivElement>(null);

  // Where the state says to be. A swipe has already got there by the time the state changes.
  useLayoutEffect(() => {
    const element = pages.current;
    const left = element ? face * element.clientWidth : 0;
    if (element && Math.abs(element.scrollLeft - left) > 1) element.scrollTo({ left, behavior: "instant" });
  }, [face, faces.length]);
  useLayoutEffect(() => {
    const element = stage.current;
    const top = element && launcherOpen ? element.clientHeight : 0;
    if (element && Math.abs(element.scrollTop - top) > 1) element.scrollTo({ top, behavior: "smooth" });
  }, [launcherOpen]);

  // And the other way round: a swipe has landed, so the state catches up.
  const latestFaces = useRef(faces);
  useLayoutEffect(() => {
    latestFaces.current = faces;
  }, [faces]);
  useEffect(() => {
    const across = pages.current;
    const down = stage.current;
    if (!across || !down) return;
    const landedOnFace = () => {
      const id = latestFaces.current[Math.round(across.scrollLeft / across.clientWidth)]?.id;
      if (id) setFaceId(id);
    };
    const landedOnPage = (event: Event) => {
      if (event.target !== down) return;
      const open = down.scrollTop > down.clientHeight / 2;
      setLauncherOpen(open);
      if (open) wake();
      else setAppId(undefined);
    };
    across.addEventListener("scrollsnapchange", landedOnFace);
    down.addEventListener("scrollsnapchange", landedOnPage);
    return () => {
      across.removeEventListener("scrollsnapchange", landedOnFace);
      down.removeEventListener("scrollsnapchange", landedOnPage);
    };
  }, []);

  const closeDetails = useCallback(() => setDetails(undefined), []);
  const closePanelSheet = useCallback(() => setPanelSheet(false), []);
  const showDetails = useCallback((entityId: string, name: string) => setDetails({ entityId, name }), []);
  const nav = useMemo(
    () => ({
      openFace(id: string) {
        setFaceId(id);
        setLauncherOpen(false);
        setAppId(undefined);
      },
      openApp(id: string) {
        setAppId(id);
        setLauncherOpen(true);
        setRecent((list) => [id, ...list.filter((other) => other !== id)]);
      },
    }),
    [],
  );

  // Left alone, the panel goes back to the room: whatever was open closes, and the music shows
  // if there is any.
  const leftAlone = useRef(false);
  if (far !== leftAlone.current) {
    leftAlone.current = far;
    if (far) {
      setLauncherOpen(false);
      setAppId(undefined);
      setDetails(undefined);
      setPanelSheet(false);
      setFaceId(activePlayer(hass) ? "music" : "modular");
    }
  }

  return (
    <ShowDetails value={showDetails}>
      <Nav value={nav}>
        <div className="shell" data-far={far || undefined} data-power={power.state} data-status={hass.status}>
          <div className="wallpaper" />
          <Bar
            faces={faces}
            current={launcherOpen ? undefined : face}
            onFace={nav.openFace}
            onHome={() => setLauncherOpen(true)}
            onPanel={() => setPanelSheet(true)}
          />
          <div className="stage" ref={stage}>
            <div className="faces" ref={pages}>
              {faces.map(({ id, Component }, i) => (
                <section
                  key={id}
                  className="face"
                  data-current={i === face || undefined}
                >
                  <Component visible={i === face && !launcherOpen} />
                </section>
              ))}
            </div>
            <Launcher
              open={launcherOpen}
              apps={apps}
              current={app}
              recent={recent}
              onHome={() => {
                if (app) setAppId(undefined);
                else setLauncherOpen(false);
              }}
            />
          </div>
          {!launcherOpen && <button className="grabber" aria-label="Open the home screen" onClick={() => setLauncherOpen(true)} />}
          {details && detailed && (
            <Details
              key={details.entityId}
              entity={detailed}
              name={details.name}
              room={roomName(hass, details.entityId)}
              onClose={closeDetails}
            />
          )}
          {panelSheet && <PanelSheet onClose={closePanelSheet} />}
          {hass.status !== "connected" && <div className="status">{statusMessage(hass)}</div>}
          <div className="blank" />
        </div>
      </Nav>
    </ShowDetails>
  );
}
