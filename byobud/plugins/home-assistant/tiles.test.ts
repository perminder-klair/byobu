import assert from "node:assert/strict";
import { test } from "node:test";
import type { HassEntity } from "home-assistant-js-websocket";
import { nameInRoom, playerFor, stateLabel, summaries, tileFor } from "./tiles.ts";

const entity = (entity_id: string, state: string, attributes: object = {}) =>
  ({ entity_id, state, attributes, last_changed: "2026-10-30T10:00:00Z" }) as unknown as HassEntity;
const picture = (path: string) => `/pictures${path}`;

test("reads states as words", () => {
  assert.equal(stateLabel("fan_only"), "Fan only");
  assert.equal(stateLabel("heat_cool"), "Heat/cool");
});

test("drops the room from a name inside that room", () => {
  assert.equal(nameInRoom(entity("light.x", "on", { friendly_name: "Living Room Ceiling Lights" }), "Living Room"), "Ceiling Lights");
  assert.equal(nameInRoom(entity("light.x", "on", { friendly_name: "Ceiling Lights" }), "Kitchen"), "Ceiling Lights");
});

test("a dimmable colour light gets its own tone and all its sliders", () => {
  const tile = tileFor(
    entity("light.a", "on", { brightness: 128, rgb_color: [255, 0, 0], color_mode: "hs", hs_color: [0, 100], supported_color_modes: ["color_temp", "hs"] }),
    undefined,
    picture,
  );
  assert.equal(tile.tone, "rgb(255 0 0)");
  assert.equal(tile.detail, "50%");
  assert.deepEqual(tile.sheet?.sections.map((section) => (section.type === "slider" ? section.label : section.type)), ["Brightness", "Colour temperature", "Colour"]);
});

test("an on/off light has no brightness slider", () => {
  const tile = tileFor(entity("light.b", "off", { supported_color_modes: ["onoff"] }), undefined, picture);
  assert.deepEqual(tile.sheet?.sections, []);
});

test("a locked lock can't be opened by a tap, but an unlocked one locks", () => {
  assert.equal(tileFor(entity("lock.a", "locked"), undefined, picture).tap, undefined);
  assert.equal(tileFor(entity("lock.a", "unlocked"), undefined, picture).tap?.data?.service, "lock");
});

test("a closed garage door can't be opened by a tap", () => {
  const closed = tileFor(entity("cover.g", "closed", { device_class: "garage", supported_features: 3 }), undefined, picture);
  assert.equal(closed.tap, undefined);
  assert.ok(closed.sheet?.sections.some((section) => section.type === "buttons"));
  const open = tileFor(entity("cover.g", "open", { device_class: "garage", supported_features: 3 }), undefined, picture);
  assert.equal(open.tap?.data?.service, "toggle");
});

test("a tilt-only cover toggles its tilt", () => {
  const tile = tileFor(entity("cover.p", "closed", { supported_features: 240 }), undefined, picture);
  assert.equal(tile.tap?.data?.service, "toggle_cover_tilt");
});

test("a thermostat offers its stepper only when it's running", () => {
  const heating = tileFor(entity("climate.a", "heat", { temperature: 20, current_temperature: 19 }), undefined, picture);
  assert.equal(heating.stepper?.value, 20);
  assert.equal(heating.value, "20");
  const off = tileFor(entity("climate.a", "off", { temperature: 20 }), undefined, picture);
  assert.equal(off.stepper, undefined);
});

test("a heat/cool thermostat shows its range and steps each end", () => {
  const tile = tileFor(entity("climate.b", "heat_cool", { target_temp_low: 21, target_temp_high: 24, hvac_modes: ["heat_cool"] }), undefined, picture);
  assert.equal(tile.value, "21-24");
  const section = tile.sheet?.sections[0];
  assert.equal(section?.type === "setpoints" && section.setpoints.length, 2);
});

test("a media player that can't play or pause opens its sheet on a tap", () => {
  assert.equal(tileFor(entity("media_player.s", "playing", { supported_features: 4194304 }), undefined, picture).tap, undefined);
  assert.equal(tileFor(entity("media_player.m", "playing", { supported_features: 1 }), undefined, picture).tap?.data?.service, "media_play_pause");
});

test("players link to their tile and route pictures through the plugin", () => {
  const player = playerFor(entity("media_player.m", "playing", { media_title: "Song", entity_picture: "/api/x", supported_features: 49 }), picture);
  assert.equal(player.picture, "/pictures/api/x");
  assert.equal(player.tile, "media_player.m");
  assert.deepEqual(player.controls.map(({ label }) => label), ["Previous", "Pause", "Next"]);
});

test("summaries count what's on", () => {
  const entities = [entity("light.a", "on"), entity("light.b", "off"), entity("lock.a", "unlocked")];
  const tiles = summaries([], entities);
  assert.deepEqual(tiles.map(({ value }) => value), ["1 on", "1 unlocked"]);
  assert.equal(tiles[0].link, "app:home");
});

test("what opens the house needs a person, and what secures it doesn't", () => {
  const buttons = (tile: ReturnType<typeof tileFor>) => tile.sheet?.sections.flatMap((section) => (section.type === "buttons" ? section.buttons : []));
  const lock = buttons(tileFor(entity("lock.a", "locked", { supported_features: 1 }), undefined, picture));
  assert.deepEqual(lock?.map(({ label, sensitive }) => [label, Boolean(sensitive)]), [["Lock", false], ["Unlock", true], ["Open", true]]);
  const garage = buttons(tileFor(entity("cover.g", "closed", { device_class: "garage", supported_features: 3 }), undefined, picture));
  assert.deepEqual(garage?.map(({ label, sensitive }) => [label, Boolean(sensitive)]), [["Open", true], ["Close", false]]);
  const blind = buttons(tileFor(entity("cover.b", "closed", { supported_features: 3 }), undefined, picture));
  assert.equal(blind?.[0].sensitive, undefined);
});
