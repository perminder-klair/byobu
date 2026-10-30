import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { byobuDevServer } from "./dev-server.ts";

export default defineConfig({
  // Relative asset paths, so the build works from wherever the panel serves it.
  base: "./",
  plugins: [react(), byobuDevServer()],
  server: {
    port: 5173,
    strictPort: true,
    // Home Assistant's API and pictures through the page's own origin, so the panel needs only
    // one tunnel.
    proxy: { "/api": { target: "http://127.0.0.1:8123", ws: true } },
  },
});
