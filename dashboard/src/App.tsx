import type { CSSProperties } from "react";
import { Header } from "./Header";
import { entityName, useHass, type Hass, type HassEntity } from "./hass";
import { EntityTile } from "./tiles";

// The kinds of thing the dashboard can control, in the order they appear within a room.
const CONTROLS = ["light", "switch", "fan", "climate", "cover", "lock", "media_player"];

type Room = { id: string; name: string; entities: HassEntity[] };

const domain = (entity: HassEntity) => entity.entity_id.split(".")[0];

// One section per Home Assistant area, in the user's order, then whatever isn't in one.
function rooms(hass: Hass, areas: NonNullable<Hass["areas"]>): Room[] {
  const controls = Object.values(hass.entities)
    .filter((entity) => CONTROLS.includes(domain(entity)) && !hass.placements.get(entity.entity_id)?.hidden)
    .sort(
      (a, b) =>
        CONTROLS.indexOf(domain(a)) - CONTROLS.indexOf(domain(b)) || entityName(a).localeCompare(entityName(b)),
    );
  const byArea = Map.groupBy(controls, (entity) => hass.placements.get(entity.entity_id)?.area);
  return [
    ...areas.map((area) => ({ id: area.area_id, name: area.name, entities: byArea.get(area.area_id) ?? [] })),
    { id: "", name: areas.length > 0 ? "Other" : "Everything", entities: byArea.get(undefined) ?? [] },
  ].filter((room) => room.entities.length > 0);
}

// "Living Room Ceiling Lights" reads as "Ceiling Lights" under Living Room.
function nameInRoom(entity: HassEntity, room: string): string {
  const name = entityName(entity);
  if (!room || !name.toLowerCase().startsWith(`${room.toLowerCase()} `)) return name;
  const rest = name.slice(room.length + 1);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function statusMessage({ status, error }: Hass): string {
  if (status === "failed") return `Can't reach Home Assistant: ${error}`;
  if (status === "reconnecting") return "Reconnecting to Home Assistant…";
  return "Connecting to Home Assistant…";
}

export function App() {
  const hass = useHass();
  const weather = Object.values(hass.entities)
    .filter((entity) => domain(entity) === "weather")
    .sort((a, b) => entityName(a).localeCompare(entityName(b)))[0];

  return (
    <div className="app" data-status={hass.status}>
      <Header config={hass.config} weather={weather} />
      <main>
        {hass.areas &&
          rooms(hass, hass.areas).map((room) => (
            <section key={room.id} style={{ "--tiles": room.entities.length } as CSSProperties}>
              <h2>{room.name}</h2>
              {room.entities.map((entity) => (
                <EntityTile key={entity.entity_id} entity={entity} name={nameInRoom(entity, room.id && room.name)} />
              ))}
            </section>
          ))}
      </main>
      {hass.status !== "connected" && <div className="status">{statusMessage(hass)}</div>}
    </div>
  );
}
