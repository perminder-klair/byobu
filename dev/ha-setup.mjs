#!/usr/bin/env node
// Onboards the dev Home Assistant (owner account, location, analytics) without the browser
// wizard, then writes the login and a long-lived access token to dev/ha-credentials.json.
// The dashboard's dev server reads the token from there. Safe to run again.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const HA = "http://127.0.0.1:8123";
const CLIENT_ID = `${HA}/`;
const CREDENTIALS = new URL("./ha-credentials.json", import.meta.url);

function die(message) {
  console.error(`ha-setup: ${message}`);
  process.exit(1);
}

async function request(path, { token, json, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = new URLSearchParams(form);
  }
  const response = await fetch(HA + path, { method: body ? "POST" : "GET", headers, body });
  if (!response.ok) die(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function waitForOnboarding() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(`${HA}/api/onboarding`);
      if (response.ok) return response.json();
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  die(`Home Assistant didn't come up on ${HA}. Is the container running?`);
}

// Sends each message once the previous reply arrives, over one authenticated WebSocket.
async function websocket(accessToken, messages) {
  const socket = new WebSocket(`${HA.replace("http", "ws")}/api/websocket`);
  const results = [];
  return new Promise((resolve, reject) => {
    socket.onerror = () => reject(new Error("WebSocket error"));
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: accessToken }));
        return;
      }
      if (message.type === "auth_invalid") return reject(new Error(message.message));
      if (message.type === "result") {
        if (!message.success) return reject(new Error(JSON.stringify(message.error)));
        results.push(message.result);
      }
      if (results.length === messages.length) {
        socket.close();
        return resolve(results);
      }
      socket.send(JSON.stringify({ id: results.length + 1, ...messages[results.length] }));
    };
  });
}

// The demo integration leaves every device unassigned. Spread them over rooms the way a real
// home would be, so the dashboard's area layout has something to show, and hide the demo's
// test-pattern fans. Rooms go on devices where there is one, as Home Assistant only gives an
// entity an area of its own when it has a name of its own. Demo locks and media players have
// no registry entry at all, so they can't be placed and stay unassigned.
const DEMO_ROOMS = {
  "Living Room": [
    "light.living_room_rgbww_lights", "light.ceiling_lights", "switch.decorative_lights",
    "fan.living_room_fan", "climate.heatpump", "cover.living_room_window",
  ],
  Kitchen: ["light.kitchen_lights", "cover.kitchen_window"],
  Bedroom: ["light.bed_light", "switch.ac", "climate.hvac", "fan.ceiling_fan"],
  Hall: ["light.entrance_color_white_lights", "cover.hall_window"],
  Office: ["light.office_rgbw_lights", "climate.ecobee"],
  Garage: ["cover.garage_door"],
};
const DEMO_HIDDEN = ["fan.percentage_full_fan", "fan.percentage_limited_fan", "fan.preset_only_limited_fan"];

async function onboard(steps, done) {
  const username = "byobu";
  const password = randomBytes(12).toString("base64url");
  const { auth_code: code } = await request("/api/onboarding/users", {
    json: { client_id: CLIENT_ID, name: "Byōbu", username, password, language: "en" },
  });
  const { access_token: accessToken } = await request("/auth/token", {
    form: { grant_type: "authorization_code", code, client_id: CLIENT_ID },
  });

  for (const { step } of steps) {
    if (done.has(step) || step === "user") continue;
    const json = step === "integration" ? { client_id: CLIENT_ID, redirect_uri: CLIENT_ID } : {};
    await request(`/api/onboarding/${step}`, { token: accessToken, json });
  }

  const [, token] = await websocket(accessToken, [
    {
      type: "config/core/update", country: "GB", currency: "GBP", unit_system: "metric",
      time_zone: "Europe/London", latitude: 51.5072, longitude: -0.1276,
    },
    { type: "auth/long_lived_access_token", client_name: "Byōbu dev panel", lifespan: 3650 },
  ]);
  return { url: "http://localhost:8123", username, password, token };
}

async function arrangeDemo(token) {
  const [areas, registry] = await websocket(token, [
    { type: "config/area_registry/list" },
    { type: "config/entity_registry/list_for_display" },
  ]);
  const ids = new Map(areas.map((area) => [area.name.toLowerCase(), area.area_id]));
  const missing = Object.keys(DEMO_ROOMS).filter((room) => !ids.has(room.toLowerCase()));
  const created = await websocket(token, missing.map((name) => ({ type: "config/area_registry/create", name })));
  for (const area of created) ids.set(area.name.toLowerCase(), area.area_id);
  const devices = new Map(registry.entities.map((entry) => [entry.ei, entry.di]));

  await websocket(token, [
    ...Object.entries(DEMO_ROOMS).flatMap(([room, entities]) =>
      entities.map((entity_id) => {
        const area_id = ids.get(room.toLowerCase());
        const device_id = devices.get(entity_id);
        return device_id
          ? { type: "config/device_registry/update", device_id, area_id }
          : { type: "config/entity_registry/update", entity_id, area_id };
      }),
    ),
    ...DEMO_HIDDEN.map((entity_id) => ({ type: "config/entity_registry/update", entity_id, hidden_by: "user" })),
  ]);
}

const existing = await readFile(CREDENTIALS, "utf8").then(JSON.parse, () => null);
const steps = await waitForOnboarding();
const done = new Set(steps.filter((step) => step.done).map((step) => step.step));

let credentials = existing;
if (!done.has("user")) {
  credentials = await onboard(steps, done);
  await writeFile(CREDENTIALS, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600 });
  console.log(`Onboarded. Log in at http://localhost:8123 as ${credentials.username}; ` +
    "the password is in dev/ha-credentials.json.");
} else {
  const response = existing?.token &&
    await fetch(`${HA}/api/`, { headers: { Authorization: `Bearer ${existing.token}` } });
  if (!response?.ok) {
    die("Home Assistant was onboarded but this script's credentials are missing or stale. " +
      "Start over with: docker compose -f dev/compose.yaml down -v");
  }
}

await arrangeDemo(credentials.token);
console.log("Demo devices are arranged into rooms.");
