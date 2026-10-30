// The phone app: the same data and the same parts as the panel, in a layout for one hand. It's
// served by the panel, so there's nothing to install. A phone gets in by scanning the QR code in
// the panel's Settings.
import { mdiChevronRight, mdiHomeOutline, mdiMonitor, mdiPlayCircleOutline, mdiTuneVariant } from "@mdi/js";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { HomeApp } from "./apps";
import { Ask } from "./Ask";
import { IconButton } from "./controls";
import { faceChoices } from "./faces";
import { Icon } from "./Icon";
import { Nav } from "./nav";
import { FaceSettings, OnPhone, PanelControls, PhoneSettings, PluginSettings, ThemeSettings } from "./settings";
import { ShowSheet, TileSheet } from "./Sheet";
import { act, activePlayer, connect, conversationOf, findTile, problem, showFace, useStore, type Placed, type Tile } from "./store";
import { TimersApp } from "./timers";
import { Win } from "./Win";

type Access = "checking" | "paired" | "unpaired" | "refused";

const TABS = [
  { id: "home", name: "Home", icon: mdiHomeOutline },
  { id: "now", name: "Now", icon: mdiPlayCircleOutline },
  { id: "panel", name: "Panel", icon: mdiMonitor },
  { id: "settings", name: "Settings", icon: mdiTuneVariant },
];

function deviceName() {
  const { userAgent } = navigator;
  return /iPhone/.test(userAgent) ? "iPhone" : /iPad/.test(userAgent) ? "iPad" : /Android/.test(userAgent) ? "Android phone" : "Phone";
}

// Takes up a code from the QR code's address if there is one, then finds out if this phone is in.
function useAccess(): Access {
  const [access, setAccess] = useState<Access>("checking");
  useEffect(() => {
    const code = location.hash.slice(1);
    history.replaceState(null, "", location.pathname);
    const pair = code
      ? fetch("api/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: deviceName() }) })
      : Promise.resolve(undefined);
    pair
      .then(async (paired) => {
        const me = await fetch("api/me");
        if (me.ok) {
          connect();
          setAccess("paired");
        } else setAccess(paired ? "refused" : "unpaired");
      })
      .catch(() => setAccess("refused"));
  }, []);
  return access;
}

function NowTab() {
  const store = useStore();
  const player = activePlayer(store);
  return (
    <>
      {player && (
        <Win title={player.name.toLowerCase()} number={1} focused className="phone-player">
          {player.picture && <img src={player.picture} alt="" />}
          <div className="song">{player.title}</div>
          <div className="dim">{player.by}</div>
          <div className="steps">
            {player.controls.map(({ icon, label, action }) => (
              <IconButton key={label} icon={icon} label={label} onClick={() => act(player.plugin, action)} />
            ))}
          </div>
        </Win>
      )}
      <TimersApp />
    </>
  );
}

function PanelTab() {
  return (
    <div className="settings">
      <div className="choices">
        <div className="label">Show on the panel</div>
        <div className="options">
          {faceChoices.map(({ id, name }) => (
            <button key={id} className="chip" onClick={() => showFace(id)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <PanelControls />
      <ThemeSettings />
      <FaceSettings />
    </div>
  );
}

function SettingsTab() {
  const plugins = useStore().snapshot?.plugins ?? [];
  const [page, setPage] = useState<string>();
  const plugin = plugins.find(({ id }) => id === page);
  if (plugin) {
    return (
      <div className="settings">
        <button className="chip" onClick={() => setPage(undefined)}>
          Back
        </button>
        <div className="sheet-name">{plugin.name}</div>
        <PluginSettings key={plugin.id} plugin={plugin} />
      </div>
    );
  }
  return (
    <div className="settings">
      <div className="plugin-list">
        {plugins.map(({ id, name, enabled, status }) => (
          <button key={id} className="field" onClick={() => setPage(id)}>
            <span>{name}</span>
            <span className="dim field-help">{enabled ? (status.message ?? "On") : "Off"}</span>
          </button>
        ))}
      </div>
      <div className="label">Phones</div>
      <PhoneSettings />
    </div>
  );
}

function PhoneApp() {
  const store = useStore();
  const [tab, setTab] = useState("home");
  const [sheet, setSheet] = useState<{ plugin: string; id: string }>();
  const sheetTile = sheet && findTile(store, sheet.plugin, sheet.id);
  const closeSheet = useCallback(() => setSheet(undefined), []);
  const showSheet = useCallback(({ plugin, id }: Placed<Tile>) => setSheet({ plugin, id }), []);
  const nav = useMemo(() => ({ openFace: showFace, openApp: (id: string) => setTab(id === "home" ? "home" : "now") }), []);
  const issue = problem(store);
  // The assistant's tab is only there if the assistant is.
  const tabs = conversationOf(store) ? [...TABS.slice(0, 1), { id: "ask", name: "Ask", icon: mdiChevronRight }, ...TABS.slice(1)] : TABS;
  return (
    <ShowSheet value={showSheet}>
      <Nav value={nav}>
        <OnPhone value>
          <div className="phone">
            <div className="phone-page">
              {tab === "home" && <HomeApp />}
              {tab === "ask" && <Ask />}
              {tab === "now" && <NowTab />}
              {tab === "panel" && <PanelTab />}
              {tab === "settings" && <SettingsTab />}
            </div>
            {issue && <div className="phone-issue">{issue}</div>}
            <nav className="phone-tabs" style={{ "--tabs": tabs.length } as CSSProperties}>
              {tabs.map(({ id, name, icon }) => (
                <button key={id} aria-current={id === tab || undefined} onClick={() => setTab(id)}>
                  <Icon path={icon} />
                  {name}
                </button>
              ))}
            </nav>
            {sheetTile && <TileSheet key={sheetTile.id} tile={sheetTile} onClose={closeSheet} />}
          </div>
        </OnPhone>
      </Nav>
    </ShowSheet>
  );
}

export function Phone() {
  const access = useAccess();
  if (access === "paired") return <PhoneApp />;
  return (
    <div className="phone-gate">
      <div className="sheet-name">byōbu</div>
      {access === "checking" && <div className="dim">Connecting…</div>}
      {access === "unpaired" && <div className="dim">On the panel, open Settings, then Phones, then Add a phone, and scan the code.</div>}
      {access === "refused" && <div className="dim">That code didn&apos;t work. Make a new one on the panel: Settings, Phones, Add a phone.</div>}
    </div>
  );
}
