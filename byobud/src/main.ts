// byobud: the local service behind the shell. It runs the plugins, holds their data and settings,
// and serves all of that to clients. Everything that talks to the outside world lives here, so
// no client ever holds a token.
import { join } from "node:path";
import { Core } from "./core.ts";
import { listThemes, startServer } from "./server.ts";
import { createSound } from "./sound.ts";

const root = import.meta.dirname;
const state = process.env.BYOBU_STATE ?? "/var/lib/byobu";
const paths = {
  shell: process.env.BYOBU_SHELL ?? "/usr/local/share/byobu/shell",
  themes: process.env.BYOBU_THEMES ?? "/usr/local/share/byobu/themes",
  defaultTheme: process.env.BYOBU_DEFAULT_THEME ?? "/etc/byobu",
};
const pluginDirectories = [join(root, root.endsWith("src") ? "../plugins" : "plugins"), join(state, "installed")];

const core = new Core(state, createSound(state));
core.themes = listThemes(paths);
const server = startServer(core, paths, Number(process.env.BYOBU_PORT ?? 8080), process.env.BYOBU_ADDRESS ?? "0.0.0.0");
await core.start(pluginDirectories);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    server.close();
    server.closeAllConnections();
    await core.stop();
    process.exit(0);
  });
}

// One plugin's bug shouldn't take the panel down with it.
process.on("uncaughtException", (error) => console.error("Uncaught:", error));
process.on("unhandledRejection", (error) => console.error("Unhandled:", error));
