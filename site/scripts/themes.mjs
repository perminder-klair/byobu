#!/usr/bin/env node
// Turns the Omarchy themes on this machine into the site's palettes, in the variables the shell's
// own stylesheet uses. Writes app/themes.css and lib/themes.ts. Run it when a theme changes.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(homedir(), ".local/share/omarchy/themes");
const COLOURS = ["background", "foreground", "accent", "red", "yellow", "green", "cyan", "blue", "magenta", "orange"];
const WORDS = { "82": "'82" };

const label = (id) => id.split("-").map((word) => WORDS[word] ?? word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

const themes = readdirSync(source)
  .filter((id) => existsSync(join(source, id, "colors.toml")))
  .map((id) => {
    const toml = readFileSync(join(source, id, "colors.toml"), "utf8");
    const values = Object.fromEntries([...toml.matchAll(/^\s*([a-z_]+)\s*=\s*"(#[0-9A-Fa-f]{3,8}|dark|light)"/gm)].map(([, key, value]) => [key, value]));
    return { id, name: label(id), mode: values.mode ?? "dark", colours: Object.fromEntries(COLOURS.flatMap((key) => (values[key] ? [[key, values[key]]] : []))) };
  });

const block = ({ id, mode, colours }) => {
  const lines = [`  color-scheme: ${mode};`, ...Object.entries(colours).map(([key, value]) => `  --${key}: ${value};`)];
  return `[data-theme="${id}"] {\n${lines.join("\n")}\n}`;
};

writeFileSync(join(here, "../app/themes.css"), `/* Written by scripts/themes.mjs from Omarchy's themes. */\n${themes.map(block).join("\n")}\n`);
writeFileSync(
  join(here, "../lib/themes.ts"),
  `// Written by scripts/themes.mjs from Omarchy's themes.\nexport type Theme = { id: string; name: string; mode: string; swatch: string[] };\n\nexport const THEMES: Theme[] = ${JSON.stringify(
    themes.map(({ id, name, mode, colours }) => ({ id, name, mode, swatch: [colours.background, colours.foreground, colours.accent, colours.red, colours.green, colours.blue] })),
    null,
    2,
  )};\n`,
);
console.log(`${themes.length} themes`);
