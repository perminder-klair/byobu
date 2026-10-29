// The connection to Home Assistant's WebSocket API, kept in a small store that components read
// with useHass(). The library reconnects by itself after a drop and resends the state.
import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  ERR_INVALID_AUTH,
  subscribeConfig,
  subscribeEntities,
  type Connection,
  type HassConfig,
  type HassEntities,
  type HassEntity,
} from "home-assistant-js-websocket";
import { useSyncExternalStore } from "react";

export type { HassConfig, HassEntity };

export type Area = { area_id: string; name: string };

// Where an entity lives and whether it's meant to be on a dashboard, from the registries.
export type Placement = { area?: string; hidden: boolean };

export type Hass = {
  status: "connecting" | "connected" | "reconnecting" | "failed";
  error?: string;
  entities: HassEntities;
  config?: HassConfig;
  // Rooms in the order the user arranged them in Home Assistant. Unset until loaded.
  areas?: Area[];
  placements: Map<string, Placement>;
};

// The compact registry the Home Assistant frontend itself uses: entity id, device id, area id,
// entity category (settings and diagnostics), and hidden.
type DisplayRegistry = { entities: { ei: string; di?: string; ai?: string; ec?: number; hb?: boolean }[] };
type Device = { id: string; area_id: string | null };

const REGISTRY_EVENTS = ["area_registry_updated", "device_registry_updated", "entity_registry_updated"];

// config.json, served next to the page. hassUrl defaults to the page's own origin, which is
// how the dev server proxies Home Assistant.
type PanelConfig = { hassUrl?: string; token: string };

let hass: Hass = { status: "connecting", entities: {}, placements: new Map() };
let connection: Connection | undefined;
const listeners = new Set<() => void>();

function update(changes: Partial<Hass>) {
  hass = { ...hass, ...changes };
  for (const listener of listeners) listener();
}

export async function connect() {
  try {
    const response = await fetch("config.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`config.json: ${await response.text()}`);
    const { hassUrl, token }: PanelConfig = await response.json();
    connection = await createConnection({
      auth: createLongLivedTokenAuth(hassUrl ?? location.origin, token),
      setupRetry: -1,
    });
  } catch (error) {
    update({
      status: "failed",
      error: error === ERR_INVALID_AUTH ? "Home Assistant rejected the access token" : String(error),
    });
    return;
  }
  const conn = connection;
  // Rooms can change while the panel is disconnected, so reload them on every reconnect too.
  let reload: ReturnType<typeof setTimeout> | undefined;
  const reloadRegistries = () => {
    clearTimeout(reload);
    reload = setTimeout(() => loadRegistries(conn), 500);
  };
  conn.addEventListener("ready", () => {
    update({ status: "connected" });
    reloadRegistries();
  });
  conn.addEventListener("disconnected", () => update({ status: "reconnecting" }));
  subscribeConfig(conn, (config) => update({ config }));
  subscribeEntities(conn, (entities) => update({ status: "connected", entities }));
  for (const event of REGISTRY_EVENTS) conn.subscribeEvents(reloadRegistries, event);
  loadRegistries(conn);
}

async function loadRegistries(conn: Connection) {
  try {
    const [areas, devices, registry] = await Promise.all([
      conn.sendMessagePromise<Area[]>({ type: "config/area_registry/list" }),
      conn.sendMessagePromise<Device[]>({ type: "config/device_registry/list" }),
      conn.sendMessagePromise<DisplayRegistry>({ type: "config/entity_registry/list_for_display" }),
    ]);
    const deviceAreas = new Map(devices.map((device) => [device.id, device.area_id ?? undefined]));
    const placements = new Map(
      registry.entities.map((entry) => [
        entry.ei,
        {
          // An entity's own area overrides its device's.
          area: entry.ai ?? (entry.di ? deviceAreas.get(entry.di) : undefined),
          hidden: Boolean(entry.hb) || entry.ec !== undefined,
        },
      ]),
    );
    update({ areas, placements });
  } catch (error) {
    console.error("Loading the area and entity registries failed", error);
  }
}

export function useHass(): Hass {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => hass,
  );
}

export function callAction(entity: HassEntity, service: string, data?: object) {
  if (!connection) return;
  const [domain] = entity.entity_id.split(".");
  callService(connection, domain, service, data, { entity_id: entity.entity_id }).catch((error) =>
    console.error(`${domain}.${service} on ${entity.entity_id} failed`, error),
  );
}

export function entityName(entity: HassEntity): string {
  return entity.attributes.friendly_name ?? entity.entity_id;
}

// Dates and times follow Home Assistant's language, country and time zone, not the panel's.
export function locale(config?: HassConfig): string | undefined {
  return config && `${config.language}-${config.country ?? ""}`.replace(/-$/, "");
}
