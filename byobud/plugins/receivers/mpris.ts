// Reads what playerctl says about the media players on the session bus, which is how shairport-sync
// and spotifyd report what they're playing. The fields are tab-separated, in FORMAT's order.
import { mdiPause, mdiPlay, mdiSkipNext, mdiSkipPrevious, mdiSpeaker } from "@mdi/js";
import type { Button, Player, Tile } from "../../src/protocol.ts";

const FIELDS = ["playerName", "status", "title", "artist", "album", "mpris:artUrl", "position", "mpris:length"];
export const FORMAT = FIELDS.map((field) => `{{${field}}}`).join("\t");

export type Playing = {
  player: string;
  status: string;
  title: string;
  artist: string;
  album: string;
  art: string;
  // Microseconds, as MPRIS gives them.
  position: number;
  length: number;
};

export function parseLine(line: string): Playing | undefined {
  const [player, status, title, artist, album, art, position, length] = line.split("\t");
  if (!player || !status) return undefined;
  return { player, status, title, artist, album, art, position: Number(position) || 0, length: Number(length) || 0 };
}

export const sourceName = (player: string) => (/shairport/i.test(player) ? "AirPlay" : /spotifyd/i.test(player) ? "Spotify" : player);

const STATES: Record<string, Player["state"]> = { Playing: "playing", Paused: "paused" };

function controls({ player, status }: Playing): Button[] {
  const action = (id: string) => ({ id, data: { player } });
  const playing = status === "Playing";
  return [
    { icon: mdiSkipPrevious, label: "Previous", action: action("previous") },
    { icon: playing ? mdiPause : mdiPlay, label: playing ? "Pause" : "Play", selected: true, action: action("play-pause") },
    { icon: mdiSkipNext, label: "Next", action: action("next") },
  ];
}

// Local files, like shairport-sync's cover art, go through the plugin; addresses are left alone.
export function pictureFor(art: string, pictureUrl: (path: string) => string): string | undefined {
  if (!art) return undefined;
  return art.startsWith("file://") ? pictureUrl(new URL(art).pathname) : art;
}

export function playerFrom(playing: Playing, pictureUrl: (path: string) => string, now = new Date()): Player {
  const { player, status, title, artist, album, art, position, length } = playing;
  return {
    id: player,
    name: sourceName(player),
    state: STATES[status] ?? "idle",
    title: title || undefined,
    by: [artist, album].filter(Boolean).join(" · ") || undefined,
    picture: pictureFor(art, pictureUrl),
    position: position / 1_000_000,
    duration: length / 1_000_000 || undefined,
    positionAt: now.toISOString(),
    controls: controls(playing),
    tile: player,
  };
}

export function tileFrom(playing: Playing, pictureUrl: (path: string) => string): Tile {
  const { player, status, title, artist } = playing;
  const buttons = controls(playing);
  return {
    id: player,
    name: sourceName(player),
    kind: "media",
    icon: mdiSpeaker,
    tone: "magenta",
    active: status === "Playing",
    detail: title ? [title, artist].filter(Boolean).join(" · ") : "Ready",
    state: status,
    tap: title ? { id: "play-pause", data: { player } } : undefined,
    sheet: {
      sections: [{ type: "media", title: title || undefined, by: artist || undefined, picture: pictureFor(playing.art, pictureUrl), controls: buttons }],
    },
  };
}
