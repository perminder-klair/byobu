// Home Assistant, over its WebSocket API. All of this happens in byobud, so the token never
// reaches a browser. Pictures come through picture() for the same reason.
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
import type { Plugin } from "../../src/plugin.ts";
import type { AgendaEvent, Forecast, Tile, Weather } from "../../src/protocol.ts";
import { CONTROLS, domain, entityName, playerFor, summaries, tileFor } from "./tiles.ts";

const RETRY_MS = 5000;
const PUBLISH_MS = 100;
const REGISTRY_MS = 500;
const AGENDA_DAYS = 7;
const AGENDA_REFRESH_MS = 10 * 60_000;

// The compact registry the Home Assistant frontend itself uses: entity id, device id, area id,
// entity category (settings and diagnostics), and hidden.
type DisplayRegistry = { entities: { ei: string; di?: string; ai?: string; ec?: number; hb?: boolean }[] };
type Device = { id: string; area_id: string | null };
type Area = { area_id: string; name: string };
type RawForecast = { datetime: string; condition?: string; temperature?: number; templow?: number; precipitation_probability?: number };

const REGISTRY_EVENTS = ["area_registry_updated", "device_registry_updated", "entity_registry_updated"];
const SCENES = ["scene", "script"];

const forecastStep = ({ datetime, condition, temperature, templow, precipitation_probability }: RawForecast): Forecast => ({
  time: datetime,
  condition,
  temperature,
  low: templow,
  rainChance: precipitation_probability,
});

const plugin: Plugin = (host) => {
  const { url, token } = host.settings as { url: string; token: string };
  if (!url || !token) {
    host.status("off", "Needs an address and a token");
    return {};
  }
  const origin = url.replace(/\/+$/, "");
  const auth = createLongLivedTokenAuth(origin, token);
  const timers: (ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>)[] = [];
  let stopped = false;
  let connection: Connection | undefined;
  let entities: HassEntities = {};
  let config: HassConfig | undefined;
  let areas: Area[] = [];
  let placements = new Map<string, { area?: string; hidden: boolean }>();
  let agenda: AgendaEvent[] = [];
  let hourly: Forecast[] = [];
  let daily: Forecast[] = [];
  let forecasts: { entity: string; stop: (() => void)[] } | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const picture = (path: string) => host.pictureUrl(path);

  // Home Assistant's default forecast for the home, if it's there, or the first by name.
  function homeWeather(): HassEntity | undefined {
    const all = Object.values(entities).filter((entity) => domain(entity) === "weather");
    return all.find(({ entity_id }) => entity_id === "weather.forecast_home") ?? all.sort((a, b) => entityName(a).localeCompare(entityName(b)))[0];
  }

  function weather(): Weather | undefined {
    const entity = homeWeather();
    if (!entity) return undefined;
    const { temperature, apparent_temperature, humidity } = entity.attributes;
    return { condition: entity.state, temperature, feelsLike: apparent_temperature, humidity, hourly, daily };
  }

  function publish() {
    const visible = Object.values(entities).filter((entity) => !placements.get(entity.entity_id)?.hidden);
    const roomOf = (id: string) => areas.find((area) => area.area_id === placements.get(id)?.area)?.name;
    const controls = visible
      .filter((entity) => CONTROLS.includes(domain(entity)) || SCENES.includes(domain(entity)))
      .sort((a, b) => CONTROLS.indexOf(domain(a)) - CONTROLS.indexOf(domain(b)) || entityName(a).localeCompare(entityName(b)));
    const tiles: Tile[] = controls.map((entity) => tileFor(entity, roomOf(entity.entity_id), picture));
    host.publish({
      tiles: summaries(tiles, controls),
      rooms: areas.map((area) => area.name),
      agenda,
      weather: weather(),
      players: visible.filter((entity) => domain(entity) === "media_player").sort((a, b) => entityName(a).localeCompare(entityName(b))).map((entity) => playerFor(entity, picture)),
      cameras: visible
        .filter((entity) => domain(entity) === "camera" && entity.attributes.entity_picture)
        .sort((a, b) => entityName(a).localeCompare(entityName(b)))
        .map((entity) => ({ id: entity.entity_id, name: entityName(entity), picture: picture(entity.attributes.entity_picture!) })),
      locale: config ? { language: `${config.language}-${config.country ?? ""}`.replace(/-$/, ""), timeZone: config.time_zone } : undefined,
    });
  }

  function schedule() {
    pending ??= setTimeout(() => {
      pending = undefined;
      publish();
    }, PUBLISH_MS);
  }

  async function loadRegistries(conn: Connection) {
    try {
      const [loadedAreas, devices, registry] = await Promise.all([
        conn.sendMessagePromise<Area[]>({ type: "config/area_registry/list" }),
        conn.sendMessagePromise<Device[]>({ type: "config/device_registry/list" }),
        conn.sendMessagePromise<DisplayRegistry>({ type: "config/entity_registry/list_for_display" }),
      ]);
      const deviceAreas = new Map(devices.map((device) => [device.id, device.area_id ?? undefined]));
      areas = loadedAreas;
      placements = new Map(
        registry.entities.map((entry) => [
          entry.ei,
          {
            // An entity's own area overrides its device's.
            area: entry.ai ?? (entry.di ? deviceAreas.get(entry.di) : undefined),
            hidden: Boolean(entry.hb) || entry.ec !== undefined,
          },
        ]),
      );
      schedule();
    } catch (error) {
      host.log("Loading the registries failed", error);
    }
  }

  async function loadAgenda(conn: Connection) {
    const calendars = Object.keys(entities).filter((id) => id.startsWith("calendar."));
    if (calendars.length === 0) return;
    const now = new Date();
    const end = new Date(now.getTime() + AGENDA_DAYS * 24 * 3600_000);
    try {
      const { response } = (await callService(
        conn,
        "calendar",
        "get_events",
        { start_date_time: now.toISOString(), end_date_time: end.toISOString() },
        { entity_id: calendars },
        true,
      )) as { response: Record<string, { events: Omit<AgendaEvent, "id">[] }> };
      agenda = Object.entries(response)
        .flatMap(([calendar, { events }]) => events.map((event) => ({ ...event, id: `${calendar}/${event.start}/${event.summary}` })))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      schedule();
    } catch (error) {
      host.log("Loading the agenda failed", error);
    }
  }

  // Home Assistant only sends forecasts to subscribers.
  function followForecasts(conn: Connection) {
    const entity = homeWeather()?.entity_id;
    if (entity === forecasts?.entity) return;
    for (const stop of forecasts?.stop ?? []) stop();
    forecasts = undefined;
    hourly = [];
    daily = [];
    if (!entity) return;
    const subscribed = { entity, stop: [] as (() => void)[] };
    forecasts = subscribed;
    const subscribe = (forecast_type: string, apply: (steps: Forecast[]) => void) => {
      conn
        .subscribeMessage<{ forecast: RawForecast[] | null }>(
          (message) => {
            apply((message.forecast ?? []).map(forecastStep));
            schedule();
          },
          { type: "weather/subscribe_forecast", entity_id: entity, forecast_type },
        )
        .then((unsubscribe) => subscribed.stop.push(unsubscribe))
        // Not every weather integration offers every kind.
        .catch((error) => host.log(`No ${forecast_type} forecast for ${entity}`, error?.message ?? error));
    };
    subscribe("hourly", (steps) => (hourly = steps));
    subscribe("daily", (steps) => (daily = steps));
  }

  function attach(conn: Connection) {
    let reload: ReturnType<typeof setTimeout> | undefined;
    const reloadRegistries = () => {
      clearTimeout(reload);
      reload = setTimeout(() => loadRegistries(conn), REGISTRY_MS);
    };
    conn.addEventListener("ready", () => {
      host.status("ok");
      reloadRegistries();
      loadAgenda(conn);
    });
    conn.addEventListener("disconnected", () => host.status("error", "Reconnecting to Home Assistant…"));
    subscribeConfig(conn, (loaded) => {
      config = loaded;
      schedule();
    });
    subscribeEntities(conn, (loaded) => {
      const first = Object.keys(entities).length === 0;
      entities = loaded;
      host.status("ok");
      followForecasts(conn);
      if (first) loadAgenda(conn);
      schedule();
    });
    for (const event of REGISTRY_EVENTS) conn.subscribeEvents(reloadRegistries, event);
    loadRegistries(conn);
    timers.push(setInterval(() => loadAgenda(conn), AGENDA_REFRESH_MS));
  }

  // The library retries by itself once connected. Until then it's done here so a bad address can
  // be told apart from a bad token, and so that stopping stops it.
  async function connect() {
    while (!stopped) {
      try {
        const conn = await createConnection({ auth, setupRetry: 0 });
        if (stopped) return conn.close();
        connection = conn;
        attach(conn);
        return;
      } catch (error) {
        if (error === ERR_INVALID_AUTH) return host.status("error", "Home Assistant rejected the access token");
        host.status("error", `Can't reach Home Assistant at ${origin}`);
        await new Promise((resolve) => timers.push(setTimeout(resolve, RETRY_MS)));
      }
    }
  }
  connect();

  function service(entityId: string, name: string, data?: object) {
    if (!connection) throw new Error("Not connected to Home Assistant");
    return callService(connection, entityId.split(".")[0], name, data, { entity_id: entityId });
  }

  return {
    async act(id, data, value) {
      const entity = String(data?.entity);
      const number = Number(value);
      if (id === "call") await service(entity, String(data?.service), data?.data as object | undefined);
      else if (id === "set") await service(entity, String(data?.service), { [String(data?.field)]: value });
      else if (id === "brightness") await (number === 0 ? service(entity, "turn_off") : service(entity, "turn_on", { brightness_pct: number }));
      else if (id === "hue") await service(entity, "turn_on", { hs_color: [number, 100] });
      // Rounding down keeps 66.7% on the second of three speeds rather than the third.
      else if (id === "speed") await service(entity, "set_percentage", { percentage: Math.floor(number) });
      else if (id === "oscillate") await service(entity, "oscillate", { oscillating: value === "on" });
      else if (id === "volume") await service(entity, "volume_set", { volume_level: number / 100 });
      else if (id === "range") {
        const low = data?.end === "target_temp_low" ? number : data?.other;
        const high = data?.end === "target_temp_high" ? number : data?.other;
        await service(entity, "set_temperature", { target_temp_low: low, target_temp_high: high });
      } else throw new Error(`Unknown action ${id}`);
    },

    picture: (path) => fetch(new URL(path, origin), { headers: { Authorization: `Bearer ${token}` } }),

    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      clearTimeout(pending);
      connection?.close();
    },
  };
};

export default plugin;
