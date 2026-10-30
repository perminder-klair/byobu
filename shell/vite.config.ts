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
    // byobud, running with `pnpm dev` in byobud/.
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
});
