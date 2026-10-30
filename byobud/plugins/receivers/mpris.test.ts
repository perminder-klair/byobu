import assert from "node:assert/strict";
import { test } from "node:test";
import { shairportConfig } from "./index.ts";
import { FORMAT, parseLine, pictureFor, playerFrom, sourceName, tileFrom } from "./mpris.ts";

const pictures = (path: string) => `/pictures${path}`;
const LINE = "ShairportSync\tPlaying\tSong\tArtist\tAlbum\tfile:///var/lib/byobu/plugins/receivers/coverart/a.jpg\t30000000\t180000000";

test("the format lists one field per column", () => {
  assert.equal(FORMAT.split("\t").length, 8);
});

test("reads a line from playerctl", () => {
  const playing = parseLine(LINE);
  assert.equal(playing?.title, "Song");
  assert.equal(playing?.position, 30_000_000);
  assert.equal(parseLine(""), undefined);
});

test("names sources", () => {
  assert.equal(sourceName("ShairportSync"), "AirPlay");
  assert.equal(sourceName("spotifyd.instance1234"), "Spotify");
});

test("a player has seconds, a by-line and controls", () => {
  const player = playerFrom(parseLine(LINE)!, pictures, new Date(0));
  assert.equal(player.state, "playing");
  assert.equal(player.duration, 180);
  assert.equal(player.position, 30);
  assert.equal(player.by, "Artist · Album");
  assert.equal(player.tile, "ShairportSync");
  assert.deepEqual(player.controls.map(({ label }) => label), ["Previous", "Pause", "Next"]);
});

test("an idle receiver is ready, with nothing to tap", () => {
  const tile = tileFrom(parseLine("spotifyd\tStopped\t\t\t\t\t0\t0")!, pictures);
  assert.equal(tile.detail, "Ready");
  assert.equal(tile.tap, undefined);
  assert.equal(playerFrom(parseLine("spotifyd\tStopped\t\t\t\t\t0\t0")!, pictures).title, undefined);
});

test("local cover art goes through the plugin and addresses don't", () => {
  assert.equal(pictureFor("file:///a/b.jpg", pictures), "/pictures/a/b.jpg");
  assert.equal(pictureFor("https://i.scdn.co/x", pictures), "https://i.scdn.co/x");
  assert.equal(pictureFor("", pictures), undefined);
});

test("the AirPlay config quotes the name and uses the session bus", () => {
  const config = shairportConfig('Kitchen "Main"', "/tmp/x");
  assert.ok(config.includes('name = "Kitchen \\"Main\\"";'));
  assert.ok(config.includes('mpris_service_bus = "session";'));
});
