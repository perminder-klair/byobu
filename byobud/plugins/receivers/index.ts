// Runs the AirPlay and Spotify Connect receivers and watches what they play. They're children of
// this plugin rather than services, so turning it off or renaming the panel just works, and what
// they play reaches Now Playing like any other player.
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createInterface } from "node:readline";
import type { Plugin } from "../../src/plugin.ts";
import { FORMAT, parseLine, playerFrom, tileFrom, type Playing } from "./mpris.ts";

const RESTART_MS = 5000;
const IMAGE_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

export function shairportConfig(name: string, directory: string): string {
  const quoted = JSON.stringify(name);
  return `general = {
  name = ${quoted};
  output_backend = "pipewire";
  dbus_service_bus = "session";
  mpris_service_bus = "session";
};
metadata = {
  enabled = "yes";
  include_cover_art = "yes";
  cover_art_cache_directory = ${JSON.stringify(join(directory, "coverart"))};
};
`;
}

const plugin: Plugin = async (host) => {
  const { name, airplay, spotify } = host.settings as { name: string; airplay: boolean; spotify: boolean };
  const players = new Map<string, Playing>();
  const children = new Set<ChildProcess>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  // Keeps a program running, as a receiver going down shouldn't need a restart of everything.
  function keep(command: string, args: string[], onLine?: (line: string) => void) {
    if (stopped) return;
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    if (child.stdout && onLine) createInterface({ input: child.stdout }).on("line", onLine);
    createInterface({ input: child.stderr! }).on("line", (line) => host.log(`${command}: ${line}`));
    child.on("error", (error) => host.log(`${command} failed:`, error.message));
    child.on("close", () => {
      children.delete(child);
      if (stopped) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        keep(command, args, onLine);
      }, RESTART_MS);
      timers.add(timer);
    });
  }

  function publish() {
    const playing = [...players.values()];
    host.publish({
      players: playing.map((item) => playerFrom(item, host.pictureUrl)),
      tiles: playing.map((item) => tileFrom(item, host.pictureUrl)),
    });
  }

  if (airplay) {
    const config = join(host.directory, "shairport-sync.conf");
    await writeFile(config, shairportConfig(name, host.directory));
    keep("shairport-sync", ["-c", config]);
  }
  if (spotify) {
    keep("spotifyd", [
      "--no-daemon",
      "--backend", "pulseaudio",
      "--use-mpris",
      "--device-name", name,
      "--device-type", "speaker",
      "--bitrate", "320",
      "--cache-path", join(host.directory, "spotify"),
    ]);
  }
  keep("playerctl", ["--all-players", "--follow", "metadata", "--format", FORMAT], (line) => {
    const playing = parseLine(line);
    if (!playing) return;
    players.set(playing.player, playing);
    publish();
  });
  host.status("ok");

  return {
    act(id, data) {
      if (!["play-pause", "next", "previous"].includes(id)) throw new Error(`Unknown action ${id}`);
      spawn("playerctl", ["--player", String(data?.player), id], { stdio: "ignore" });
    },
    async picture(path) {
      // Only cover art this plugin's own receivers wrote.
      if (!path.startsWith(host.directory)) return new Response(null, { status: 404 });
      const type = IMAGE_TYPES[extname(path).toLowerCase()] ?? "image/jpeg";
      return new Response(await readFile(path), { headers: { "Content-Type": type } });
    },
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      for (const child of children) child.kill();
    },
  };
};

export default plugin;
