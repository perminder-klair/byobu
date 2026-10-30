// Development only: serves the files the shell loads at runtime. On a panel they come from its
// settings instead of the build.
//
//   /theme.css      this desktop's current Omarchy theme, pushed to open pages when it changes
//   /wallpaper.jpg  this desktop's current wallpaper, likewise
import { execFileSync } from "node:child_process";
import { readFileSync, watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Plugin } from "vite";

const OMARCHY_CURRENT = join(homedir(), ".local/state/omarchy/current");

export function byobuDevServer(): Plugin {
  return {
    name: "byobu-dev-server",
    apply: "serve",
    configureServer(server) {
      // The same converter the panel uses.
      const byobuTheme = join(server.config.root, "../rootfs/usr/local/bin/byobu-theme");

      server.middlewares.use("/theme.css", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/css");
        try {
          res.end(execFileSync(byobuTheme, { input: readFileSync(join(OMARCHY_CURRENT, "theme/colors.toml")) }));
        } catch {
          res.end("/* No Omarchy theme on this machine: the built-in palette applies. */\n");
        }
      });

      server.middlewares.use("/wallpaper.jpg", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        try {
          res.end(readFileSync(join(OMARCHY_CURRENT, "background")));
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });

      // `omarchy theme set` swaps out theme/ and rewrites theme.name next to it.
      let pending: NodeJS.Timeout | undefined;
      try {
        const watcher = watch(OMARCHY_CURRENT, () => {
          clearTimeout(pending);
          pending = setTimeout(() => server.ws.send({ type: "custom", event: "byobu:theme" }), 300);
        });
        server.httpServer?.on("close", () => watcher.close());
      } catch {
        // Not an Omarchy desktop.
      }
    },
  };
}
