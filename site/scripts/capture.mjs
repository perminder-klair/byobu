#!/usr/bin/env node
// Takes the site's screenshots from the real shell and byobud, on throwaway state with the fixture
// home in place of Home Assistant. Saves to public/shots. Ports 8080 and 5173 need to be free.
//
//   pnpm capture            everything
//   pnpm capture modular    only the shots with these names
//
// Needs Chromium and ImageMagick. CHROMIUM overrides where the browser is.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { wallpaper } from "./art.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const out = join(here, "../public/shots");
const THEMES = join(homedir(), ".local/share/omarchy/themes");
const API = "http://127.0.0.1:8080";
const SHELL = "http://localhost:5173";
const only = process.argv.slice(2);
const wanted = (name) => only.length === 0 || only.includes(name);

// The scripted stand-in for the Messages API: what each question does, and what's said after.
const SCRIPT = [
  { ask: /kitchen/i, device: /kitchen.*lights|^lights$/i, control: "Toggle", say: "Done, the kitchen lights are off." },
  { ask: /front door/i, device: /front door/i, control: "Unlock", say: "That needs a person, so there's a Confirm button for you to press." },
];

function events(content, stop_reason) {
  const list = [["message_start", { type: "message_start", message: { id: "msg", type: "message", role: "assistant", model: "stand-in", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }]];
  content.forEach((block, index) => {
    const start = block.type === "text" ? { type: "text", text: "" } : { type: "tool_use", id: block.id, name: block.name, input: {} };
    const delta = block.type === "text" ? { type: "text_delta", text: block.text } : { type: "input_json_delta", partial_json: JSON.stringify(block.input) };
    list.push(["content_block_start", { type: "content_block_start", index, content_block: start }]);
    list.push(["content_block_delta", { type: "content_block_delta", index, delta }]);
    list.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  list.push(["message_delta", { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 1 } }]);
  list.push(["message_stop", { type: "message_stop" }]);
  return list.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

let calls = 0;
function answer(messages) {
  const last = messages.at(-1);
  const question = messages.findLast(({ content }) => typeof content === "string")?.content ?? "";
  const step = SCRIPT.find(({ ask }) => ask.test(question));
  if (typeof last.content === "string") return [[{ type: "tool_use", id: `call-${++calls}`, name: "find_devices", input: {} }], "tool_use"];
  const { content } = last.content.find(({ type }) => type === "tool_result");
  if (!String(content).startsWith("[")) return [[{ type: "text", text: step.say }], "end_turn"];
  const device = JSON.parse(content).find(({ name, room, controls }) => step.device.test(`${room ?? ""} ${name}`) && controls.some(({ name: control }) => control === step.control));
  return [[{ type: "tool_use", id: `call-${++calls}`, name: "control_device", input: { ref: device.ref, control: step.control } }], "tool_use"];
}

function startStandIn() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => res.writeHead(200, { "Content-Type": "text/event-stream" }).end(events(...answer(JSON.parse(body).messages))));
  });
  server.listen(8765, "127.0.0.1");
  return server;
}

function startServices(state) {
  mkdirSync(join(state, "plugins"), { recursive: true });
  mkdirSync(join(state, "installed"));
  symlinkSync(join(here, "fixture"), join(state, "installed/fixture"));
  writeFileSync(join(state, "panel.json"), JSON.stringify({ night: "off" }));
  const write = (id, record) => writeFileSync(join(state, "plugins", `${id}.json`), JSON.stringify(record));
  write("home-assistant", { enabled: false, values: {} });
  write("receivers", { enabled: false, values: {} });
  write("assistant", { enabled: true, values: { apiKey: "stand-in", model: "stand-in" } });
  // No PATH, so byobud can't find wpctl and change this machine's volume.
  const env = {
    HOME: homedir(),
    PATH: "/nonexistent",
    BYOBU_ADDRESS: "127.0.0.1",
    BYOBU_STATE: state,
    BYOBU_THEMES: join(state, "themes"),
    BYOBU_DEFAULT_THEME: join(state, "theme"),
    BYOBU_SHELL: join(repo, "shell/dist"),
    ANTHROPIC_BASE_URL: "http://127.0.0.1:8765",
  };
  return [
    spawn(process.execPath, ["src/main.ts"], { cwd: join(repo, "byobud"), env, stdio: "ignore" }),
    spawn("node_modules/.bin/vite", ["--logLevel", "error"], { cwd: join(repo, "shell"), stdio: "ignore" }),
  ];
}

async function ready(url) {
  for (let tries = 0; tries < 100; tries++) {
    if (await fetch(url).then(({ ok }) => ok, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${url} didn't come up`);
}

const post = (path, method, body) => fetch(`${API}/api/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const act = (plugin, id, body = {}) => post(`plugins/${plugin}/actions/${id}`, "POST", body);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function save(png, name, quality = 80) {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  execFileSync("magick", ["png:-", "-quality", String(quality), "-define", "webp:method=6", join(out, `${name}.webp`)], { input: png });
}

const palette = (theme) => Object.fromEntries([...readFileSync(join(THEMES, theme, "colors.toml"), "utf8").matchAll(/^\s*([a-z_]+)\s*=\s*"(#[0-9A-Fa-f]{3,8})"/gm)].map(([, key, value]) => [key, value]));

async function openPanel(browser, theme, { scale = 2, width = 1280, height = 720, path = "/" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const css = execFileSync(join(repo, "rootfs/usr/local/bin/byobu-theme"), { input: readFileSync(join(THEMES, theme, "colors.toml")) });
  await page.route("**/api/backlight", (route) => route.fulfill({ status: 204 }));
  await page.route("**/theme.css*", (route) => route.fulfill({ contentType: "text/css", body: css }));
  await page.route("**/wallpaper.jpg*", (route) => route.fulfill({ contentType: "image/svg+xml", body: wallpaper(palette(theme)) }));
  await page.clock.install();
  await page.goto(`${SHELL}${path}`, { waitUntil: "load" });
  await pause(1200);
  return page;
}

async function takeThemes(browser) {
  for (const theme of readdirSync(THEMES)) {
    if (!existsSync(join(THEMES, theme, "colors.toml")) || (!wanted(theme) && !wanted("themes"))) continue;
    const page = await openPanel(browser, theme, { scale: 1 });
    save(await page.screenshot(), `themes/${theme}`, 76);
    await page.context().close();
  }
}

async function takePanel(browser) {
  const page = await openPanel(browser, "kanagawa");
  const shot = async (name) => wanted(name) && save(await page.screenshot(), name);
  const face = async (number) => {
    await page.click(`.workspaces button[aria-label='Face ${number}']`);
    await pause(900);
  };
  const home = async () => {
    await page.click(".workspaces .launch");
    await pause(1100);
    if (await page.locator(".app-view").count()) {
      await page.click(".rail-home");
      await pause(400);
    }
  };
  const app = async (name) => {
    await home();
    await page.click(`.apps .app:has-text('${name}')`);
    await pause(600);
  };
  const close = async () => {
    await page.keyboard.press("Escape");
    await page.click(".overlay", { position: { x: 4, y: 4 } }).catch(() => {});
    await pause(400);
  };

  for (const [number, name] of ["modular", "clock", "weather", "music", "cameras"].entries()) {
    await face(number + 1);
    await shot(name);
  }

  await home();
  await shot("home");
  await app("home");
  await shot("rooms");

  const ceiling = await page.locator(".tile:has-text('Ceiling')").boundingBox();
  await page.mouse.move(ceiling.x + 40, ceiling.y + 40);
  await page.mouse.down();
  await pause(650);
  await page.mouse.up();
  await pause(500);
  await shot("sheet-light");
  await close();

  await page.click(".room-list button:has-text('Hall')");
  await pause(300);
  await page.click(".tile:has-text('Front door')");
  await pause(500);
  await shot("sheet-lock");
  await close();

  await page.click("[aria-label='Panel settings']");
  await pause(500);
  await shot("panel-sheet");
  await close();

  await act("timers", "start", { data: { seconds: 840, label: "Pasta" } });
  await act("timers", "start", { data: { seconds: 2700, label: "Oven" } });
  await app("timers");
  await shot("timers");

  await app("settings");
  // This home isn't something a real panel would list.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll(".app-view button, .app-view div")) {
      if (element.childElementCount === 0 && element.textContent === "Fixture home") element.remove();
      if (element.childElementCount === 0 && element.textContent === "Byōbu development") element.textContent = "";
    }
  });
  await shot("settings");

  // The assistant answers through the stand-in, so the words here are scripted, though the tiles,
  // the Confirm button and everything else are what the plugin really does. Asking first opens the
  // conversation rather than the keyboard.
  await act("assistant", "ask", { value: "turn off the kitchen lights" });
  await pause(900);
  await home();
  await page.click(".launcher-prompt");
  await pause(500);
  await shot("ask");
  await act("assistant", "forget");
  await act("assistant", "ask", { value: "open the front door" });
  await pause(900);
  await shot("ask-confirm");
  await act("assistant", "forget");

  await post("panel", "PUT", { night: "on" });
  await pause(1500);
  await page.reload();
  await pause(1500);
  await shot("night");
  await post("panel", "PUT", { night: "off" });
  await pause(800);
  await page.reload();
  await pause(1500);

  // Left alone with music on, it goes to Now Playing. With nothing to play, to Modular.
  const speakers = (service) => Promise.all(["living_room", "kitchen"].map((id) => act("fixture", "call", { data: { entity: `media_player.${id}`, service } })));
  await page.clock.fastForward(46_000);
  await pause(1200);
  await shot("far-music");
  await speakers("turn_off");
  await page.mouse.click(640, 400);
  await pause(800);
  await page.clock.fastForward(46_000);
  await pause(1200);
  await shot("far-modular");
  await page.mouse.click(640, 400);
  await speakers("media_play_pause");
  await pause(600);

  await act("timers", "start", { data: { seconds: 1, label: "Pasta's ready" } });
  await pause(2200);
  await shot("alert");
  await page.click(".alert .actions button");
  await page.context().close();
}

async function takePhone(browser) {
  const page = await openPanel(browser, "kanagawa", { scale: 2, width: 390, height: 844, path: "/phone" });
  const tab = async (name) => {
    await page.click(`nav button:has-text('${name}'), .tabs button:has-text('${name}')`);
    await pause(600);
  };
  const shot = async (name) => wanted(name) && save(await page.screenshot(), name);
  await shot("phone-home");
  await tab("Now");
  await shot("phone-now");
  await tab("Panel");
  await shot("phone-panel");
  await tab("Settings");
  await shot("phone-settings");
  await page.context().close();
}

const state = mkdtempSync(join(tmpdir(), "byobu-capture-"));
const standIn = startStandIn();
const services = startServices(state);
let browser;
try {
  await Promise.all([ready(`${API}/api/me`), ready(SHELL)]);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", args: ["--force-color-profile=srgb"] });
  // Themes first, while nothing's running, as a timer would show up in every one of them.
  await takeThemes(browser);
  await takePanel(browser);
  await takePhone(browser);
} finally {
  await browser?.close();
  for (const service of services) service.kill();
  standIn.close();
  rmSync(state, { recursive: true, force: true });
}
