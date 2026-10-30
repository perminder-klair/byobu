// A made-up home for the website's screenshots, published through the normal plugin contract. Its
// tiles come from the Home Assistant plugin's own builders, so they're what a real home would get,
// without the demo integration's odd names or its pictures, which aren't ours to publish.
import { playerFor, summaries, tileFor } from "../../../byobud/plugins/home-assistant/tiles.ts";
import { album, camera } from "../art.mjs";

const COLOUR_LIGHT = {
  supported_color_modes: ["color_temp", "hs"],
  color_mode: "color_temp",
  min_color_temp_kelvin: 2000,
  max_color_temp_kelvin: 6500,
};
const SPEAKER = 1 | 4 | 16 | 32 | 16384;

const entity = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes, last_changed: new Date(Date.now() - 3_600_000).toISOString() });

const light = (id, friendly_name, percent = 0, kelvin = 2900) =>
  entity(`light.${id}`, percent ? "on" : "off", {
    friendly_name,
    ...COLOUR_LIGHT,
    ...(percent ? { brightness: percent * 2.55, color_temp_kelvin: kelvin, rgb_color: [255, 196, 137], hs_color: [30, 46] } : {}),
  });

const blind = (id, position) =>
  entity(`cover.${id}`, position ? "open" : "closed", { friendly_name: "Blind", current_position: position, supported_features: 1 | 2 | 4 | 8 });

const ROOMS = {
  "Living Room": [
    entity("climate.heating", "heat", { friendly_name: "Heating", temperature: 20.5, current_temperature: 19.5, hvac_modes: ["off", "heat"], hvac_action: "heating", target_temp_step: 0.5, min_temp: 7, max_temp: 30 }),
    light("ceiling", "Ceiling", 60),
    light("lamp", "Lamp", 35, 2400),
    light("shelves", "Shelves", 20, 2200),
    blind("living", 70),
    entity("fan.living", "off", { friendly_name: "Fan", supported_features: 1, percentage: 0, percentage_step: 25 }),
  ],
  Kitchen: [light("kitchen", "Lights", 80, 3400), light("cupboards", "Under cupboards", 45), blind("kitchen", 0), entity("lock.back_door", "unlocked", { friendly_name: "Back door" })],
  Bedroom: [light("bedside", "Bedside"), light("wardrobe", "Wardrobe"), blind("bedroom", 0), entity("fan.bedroom", "off", { friendly_name: "Fan", supported_features: 1, percentage: 0, percentage_step: 25 })],
  Hall: [light("hall", "Lights", 50), entity("lock.front_door", "locked", { friendly_name: "Front door" })],
  Office: [light("desk", "Desk", 70, 4000), entity("switch.printer", "off", { friendly_name: "Printer" })],
  Garage: [entity("cover.garage", "closed", { friendly_name: "Door", device_class: "garage", supported_features: 1 | 2 })],
};
const LOOSE = [
  entity("scene.evening", "scening", { friendly_name: "Evening" }),
  entity("scene.film", "scening", { friendly_name: "Film night" }),
  entity("scene.away", "scening", { friendly_name: "Away" }),
];
const SPEAKERS = [
  entity("media_player.living_room", "playing", {
    friendly_name: "Living Room",
    supported_features: SPEAKER,
    media_title: "Low Tide",
    media_artist: "Paper Walls",
    media_album_name: "Six Panels",
    entity_picture: "/art/low-tide",
    volume_level: 0.4,
    media_position: 94,
    media_duration: 247,
    media_position_updated_at: new Date().toISOString(),
  }),
  entity("media_player.kitchen", "paused", { friendly_name: "Kitchen", supported_features: SPEAKER, media_title: "The Morning Shipping Forecast", media_artist: "Radio", volume_level: 0.3 }),
];

const hours = (from) => new Date(Date.now() + from * 3_600_000).toISOString();
const days = (from) => {
  const date = new Date(Date.now() + from * 86_400_000);
  return date.toISOString().slice(0, 10);
};

const AGENDA = [
  ["Bins out", 15],
  ["Dentist", 40, "High Street"],
  ["Boiler service", 62],
  ["Dinner with Sam and Priya", 88],
  ["Piano lesson", 112],
];

const WEATHER_BY_HOUR = [
  ["partlycloudy", 14, 10],
  ["partlycloudy", 14, 15],
  ["cloudy", 13, 30],
  ["rainy", 12, 65],
  ["rainy", 12, 80],
  ["rainy", 11, 70],
  ["cloudy", 11, 40],
  ["cloudy", 10, 25],
  ["partlycloudy", 10, 15],
  ["clear-night", 9, 5],
  ["clear-night", 9, 5],
  ["clear-night", 8, 5],
];
const WEATHER_BY_DAY = [
  ["rainy", 14, 8, 80],
  ["partlycloudy", 13, 6, 20],
  ["sunny", 15, 5, 5],
  ["sunny", 16, 7, 5],
  ["cloudy", 14, 9, 35],
  ["rainy", 12, 8, 75],
  ["partlycloudy", 13, 6, 25],
];

// What a press does in a home with nothing behind it.
const NEXT_STATE = {
  toggle: (state) => (state === "on" ? "off" : state === "off" ? "on" : state === "open" ? "closed" : "open"),
  turn_on: () => "on",
  turn_off: () => "off",
  lock: () => "locked",
  unlock: () => "unlocked",
  media_play_pause: (state) => (state === "playing" ? "paused" : "playing"),
};

const plugin = (host) => {
  const placed = [...Object.entries(ROOMS).flatMap(([room, entities]) => entities.map((one) => ({ room, entity: one }))), ...[...LOOSE, ...SPEAKERS].map((one) => ({ entity: one }))];

  function publish() {
    const tiles = placed.map(({ entity: one, room }) => tileFor(one, room, host.pictureUrl));
    host.publish({
      rooms: Object.keys(ROOMS),
      tiles: summaries(tiles, placed.map(({ entity: one }) => one)),
      players: SPEAKERS.map((speaker) => playerFor(speaker, host.pictureUrl)),
      cameras: [
        { id: "front", name: "Front door", picture: host.pictureUrl("/camera/front") },
        { id: "garden", name: "Garden", picture: host.pictureUrl("/camera/garden") },
      ],
      weather: {
        condition: "partlycloudy",
        temperature: 14,
        feelsLike: 12,
        humidity: 72,
        hourly: WEATHER_BY_HOUR.map(([condition, temperature, rainChance], i) => ({ time: hours(i), condition, temperature, rainChance })),
        daily: WEATHER_BY_DAY.map(([condition, temperature, low, rainChance], i) => ({ time: days(i), condition, temperature, low, rainChance })),
      },
      agenda: AGENDA.map(([summary, from, location]) => ({ id: summary, start: hours(from), end: hours(from + 1), summary, location })),
      locale: { language: "en-GB", timeZone: "Europe/London" },
    });
  }

  publish();
  host.status("ok");

  return {
    act(id, data) {
      if (id !== "call") return;
      const next = NEXT_STATE[data?.service];
      const found = placed.find(({ entity: one }) => one.entity_id === data?.entity);
      if (!next || !found) return;
      found.entity = { ...found.entity, state: next(found.entity.state) };
      const speaker = SPEAKERS.findIndex(({ entity_id }) => entity_id === data.entity);
      if (speaker >= 0) SPEAKERS[speaker] = found.entity;
      publish();
    },
    picture(path) {
      const svg = path === "/art/low-tide" ? album() : camera(path.split("/").pop());
      return Promise.resolve(new Response(svg, { headers: { "content-type": "image/svg+xml" } }));
    },
  };
};

export default plugin;
