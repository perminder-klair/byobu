// The whole screen: the bar, the faces you swipe between, and the home screen you swipe up to.
// Swipes are native scrolling with snap points, which the GPU runs by itself. A drag handled in
// JavaScript would need the main thread for every frame.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApps } from "./apps";
import { Ask } from "./Ask";
import { Bar } from "./Bar";
import { ActionButton } from "./controls";
import { useFaces } from "./faces";
import { Icon } from "./Icon";
import { Launcher } from "./Launcher";
import { Nav } from "./nav";
import { usePower, wake } from "./power";
import { PanelControls } from "./settings";
import { SheetFrame, ShowSheet, TileSheet, toneColour } from "./Sheet";
import { act, activePlayer, alerts, findTile, onShow, problem, useStore, type Placed, type Tile } from "./store";

import { loadTheme } from "./theme";

export function Shell() {
  const store = useStore();
  const power = usePower();
  const faces = useFaces(store);
  const apps = useApps(store);
  const [faceId, setFaceId] = useState("modular");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [appId, setAppId] = useState<string>();
  const [recent, setRecent] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ plugin: string; id: string }>();
  const [panelSheet, setPanelSheet] = useState(false);
  const [asking, setAsking] = useState(false);

  // A face can disappear, like Now Playing when the music stops.
  const face = Math.max(0, faces.findIndex(({ id }) => id === faceId));
  const app = launcherOpen ? apps.find(({ id }) => id === appId) : undefined;
  const far = power.state !== "near";
  const issue = problem(store);
  const sheetTile = sheet && findTile(store, sheet.plugin, sheet.id);
  const theme = store.snapshot?.panel;
  const firstTheme = useRef(true);
  useEffect(() => {
    if (theme?.theme === undefined) return;
    if (!firstTheme.current) loadTheme();
    firstTheme.current = false;
  }, [theme?.theme, theme?.themeStamp]);

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

  // Something needing attention wakes the screen, from anything short of an empty room.
  const alert = alerts(store)[0];
  useEffect(() => {
    if (alert) wake();
  }, [alert?.id]);

  const closeSheet = useCallback(() => setSheet(undefined), []);
  const closePanelSheet = useCallback(() => setPanelSheet(false), []);
  const showSheet = useCallback(({ plugin, id }: Placed<Tile>) => setSheet({ plugin, id }), []);
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

  useEffect(
    () =>
      onShow((id) => {
        wake();
        nav.openFace(id);
      }),
    [nav],
  );

  // Left alone, the panel goes back to the room: whatever was open closes, and the music shows
  // if there is any.
  const leftAlone = useRef(false);
  if (far !== leftAlone.current) {
    leftAlone.current = far;
    if (far) {
      setLauncherOpen(false);
      setAppId(undefined);
      setSheet(undefined);
      setPanelSheet(false);
      setAsking(false);
      setFaceId(activePlayer(store) ? "music" : (faces[0]?.id ?? "modular"));
    }
  }

  return (
    <ShowSheet value={showSheet}>
      <Nav value={nav}>
        <div className="shell" data-far={far || undefined} data-power={power.state}>
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
              onAsk={() => setAsking(true)}
            />
          </div>
          {!launcherOpen && <button className="grabber" aria-label="Open the home screen" onClick={() => setLauncherOpen(true)} />}
          {asking && <Ask onClose={() => setAsking(false)} />}
          {sheetTile && <TileSheet key={sheetTile.id} tile={sheetTile} onClose={closeSheet} />}
          {panelSheet && (
            <SheetFrame title="Panel" subtitle="This screen" tone="var(--accent)" onClose={closePanelSheet}>
              <PanelControls />
            </SheetFrame>
          )}
          {alert && (
            <div className="overlay alert" style={{ "--tone": toneColour(alert.tone) } as CSSProperties}>
              <div className="sheet">
                <Icon path={alert.icon} />
                <div className="sheet-name">{alert.title}</div>
                {alert.detail && <div className="sheet-state">{alert.detail}</div>}
                <div className="actions">
                  {alert.actions.map(({ icon, label, selected, action }) => (
                    <ActionButton key={label} icon={icon} label={label} selected={selected} onClick={() => act(alert.plugin, action)} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {issue && <div className="status">{issue}</div>}
          <div className="blank" />
        </div>
      </Nav>
    </ShowSheet>
  );
}
