// Bundles byobud and each plugin into dist/, so a panel needs Node but no node_modules. Each file
// keeps only the icons it uses, out of thousands.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { rolldown } from "rolldown";

rmSync("dist", { recursive: true, force: true });
const plugins = readdirSync("plugins").filter((name) => existsSync(`plugins/${name}/manifest.json`));
const input = { byobud: "src/main.ts", ...Object.fromEntries(plugins.map((name) => [`plugins/${name}/index`, `plugins/${name}/index.ts`])) };
// The ES modules, which is what lets the unused icons be left out.
const bundle = await rolldown({ input, platform: "node", resolve: { mainFields: ["module", "main"] } });
await bundle.write({ dir: "dist", format: "esm", entryFileNames: "[name].mjs", chunkFileNames: "chunks/[name]-[hash].mjs", minify: true });
for (const name of plugins) cpSync(`plugins/${name}/manifest.json`, `dist/plugins/${name}/manifest.json`);
