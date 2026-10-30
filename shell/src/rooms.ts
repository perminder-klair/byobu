// The controllable things in the home, in the rooms the user arranged in Home Assistant.
import { entityName, type Hass, type HassEntity } from "./hass";

// The kinds of thing the shell can control, in the order they appear within a room.
const CONTROLS = ["light", "switch", "fan", "climate", "cover", "lock", "media_player"];

export type Room = { id: string; name: string; entities: HassEntity[] };

export const domain = (entity: HassEntity) => entity.entity_id.split(".")[0];

export function visibleEntities(hass: Hass, domains: string[]): HassEntity[] {
  return Object.values(hass.entities)
    .filter((entity) => domains.includes(domain(entity)) && !hass.placements.get(entity.entity_id)?.hidden)
    .sort(
      (a, b) => domains.indexOf(domain(a)) - domains.indexOf(domain(b)) || entityName(a).localeCompare(entityName(b)),
    );
}

// One room per Home Assistant area, in the user's order, then whatever isn't in one.
export function rooms(hass: Hass): Room[] {
  const areas = hass.areas ?? [];
  const byArea = Map.groupBy(visibleEntities(hass, CONTROLS), (entity) => hass.placements.get(entity.entity_id)?.area);
  return [
    ...areas.map((area) => ({ id: area.area_id, name: area.name, entities: byArea.get(area.area_id) ?? [] })),
    { id: "", name: areas.length > 0 ? "Other" : "Everything", entities: byArea.get(undefined) ?? [] },
  ].filter((room) => room.entities.length > 0);
}

export function roomName(hass: Hass, entityId: string): string | undefined {
  return hass.areas?.find((area) => area.area_id === hass.placements.get(entityId)?.area)?.name;
}

// "Living Room Ceiling Lights" reads as "Ceiling Lights" under Living Room.
export function nameInRoom(entity: HassEntity, room?: string): string {
  const name = entityName(entity);
  if (!room || !name.toLowerCase().startsWith(`${room.toLowerCase()} `)) return name;
  const rest = name.slice(room.length + 1);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
