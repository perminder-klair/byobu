// byobud's HTTP side: the shell's files, and the API it talks to. The files are the same for
// everyone and hold nothing private. The API takes either the panel's own browser, on localhost,
// or a paired device. Plain HTTP on the home network, so a token is only as private as the Wi-Fi.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import type { Core } from "./core.ts";
import { setBacklight } from "./backlight.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const MAX_BODY = 64 * 1024;
const COOKIE = "byobu_client";
// Ten years: a phone stays paired until it's removed in Settings.
const COOKIE_SECONDS = 10 * 365 * 24 * 3600;

export type Paths = { shell: string; themes: string; defaultTheme: string };

// The client's fault, so not worth a stack trace in the log.
class BadRequest extends Error {}

function sendFile(res: ServerResponse, path: string) {
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(path).pipe(res);
}

function fail(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "text/plain" }).end(message);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  // A plain form or a cross-site page can't send this type without asking first, and nothing
  // here answers when it asks.
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new BadRequest("Expected JSON");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new BadRequest("Too long");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

function themeFile(paths: Paths, theme: string, name: string): string {
  const chosen = theme && /^[\w.-]+$/.test(theme) ? join(paths.themes, theme, name) : "";
  return chosen && existsSync(chosen) ? chosen : join(paths.defaultTheme, name);
}

export function listThemes(paths: Paths): string[] {
  try {
    return readdirSync(paths.themes).filter((name) => existsSync(join(paths.themes, name, "theme.css"))).sort();
  } catch {
    return [];
  }
}

const isLocal = ({ socket }: IncomingMessage) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket.remoteAddress ?? "");

function tokenFrom({ headers }: IncomingMessage): string | undefined {
  const bearer = headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  return bearer ?? headers.cookie?.match(new RegExp(`(?:^|; )${COOKIE}=([0-9a-f]+)`))?.[1];
}

// The panel's address on the network, for the QR code. The name could fail to resolve on a phone.
function lanAddress(req: IncomingMessage): string {
  const addresses = Object.values(networkInterfaces()).flat();
  const lan = addresses.find((address) => address?.family === "IPv4" && !address.internal);
  return lan?.address ?? req.headers.host?.split(":")[0] ?? "localhost";
}

async function api(core: Core, req: IncomingMessage, res: ServerResponse, path: string, port: number) {
  const [, , route, id, sub, name] = path.split("/");

  if (req.method === "POST" && route === "pair") {
    const { code, name: client } = await readBody(req);
    const token = core.pair(String(code), String(client ?? "Phone"));
    if (!token) return fail(res, 403, "That code didn't work. Scan a new one on the panel.");
    res.writeHead(204, { "Set-Cookie": `${COOKIE}=${token}; Max-Age=${COOKIE_SECONDS}; Path=/; HttpOnly; SameSite=Strict` });
    return res.end();
  }

  if (!isLocal(req) && !core.clients.has(tokenFrom(req))) return fail(res, 401, "Not paired");

  if (req.method === "GET" && route === "me") return res.writeHead(204).end();

  // Starting a pairing takes being at the panel, so it can't be done from a phone.
  if (req.method === "POST" && route === "pairing") {
    if (!isLocal(req)) return fail(res, 403, "Only the panel can do this");
    const { code, expires } = core.clients.startPairing();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ url: `http://${lanAddress(req)}:${port}/phone#${code}`, expires }));
  }

  if (req.method === "DELETE" && route === "clients" && id) {
    core.removeClient(id);
    return res.writeHead(204).end();
  }

  if (req.method === "POST" && route === "show") {
    const { face } = await readBody(req);
    core.showFace(String(face));
    return res.writeHead(204).end();
  }

  if (req.method === "GET" && route === "events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: snapshot\ndata: ${JSON.stringify(core.snapshot())}\n\n`);
    const unsubscribe = core.subscribe((update) => res.write(`data: ${JSON.stringify(update)}\n\n`));
    req.on("close", unsubscribe);
    return;
  }

  if (req.method === "GET" && route === "pictures" && id && sub) {
    const picture = await core.picture(id, decodeURIComponent(sub));
    if (!picture?.ok || !picture.body) return fail(res, 404, "No such picture");
    res.writeHead(200, { "Content-Type": picture.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "no-store" });
    Readable.fromWeb(picture.body as never).pipe(res);
    return;
  }

  if (req.method === "POST" && route === "plugins" && id && sub === "actions" && name) {
    const { data, value } = await readBody(req);
    await core.act(id, name, data as Record<string, unknown> | undefined, value);
    return res.writeHead(204).end();
  }

  if (req.method === "PUT" && route === "plugins" && id && !sub && core.has(id)) {
    const { enabled, values } = await readBody(req);
    await core.updatePlugin(id, {
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      values: values as Record<string, unknown> | undefined,
    });
    return res.writeHead(204).end();
  }

  if (req.method === "PUT" && route === "panel") {
    core.updatePanel(await readBody(req));
    return res.writeHead(204).end();
  }

  if (req.method === "PUT" && route === "output") {
    const { id: output } = await readBody(req);
    await core.selectOutput(String(output));
    return res.writeHead(204).end();
  }

  if (req.method === "POST" && route === "backlight") {
    const { percent } = await readBody(req);
    if (typeof percent !== "number" || percent < 0 || percent > 100) return fail(res, 400, "percent must be 0 to 100");
    setBacklight(percent);
    return res.writeHead(204).end();
  }

  fail(res, 404, "No such route");
}

export function startServer(core: Core, paths: Paths, port: number, address: string) {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path.startsWith("/api/")) {
      api(core, req, res, path, port).catch((error) => {
        if (error instanceof BadRequest) return fail(res, 400, error.message);
        console.error(`${req.method} ${path} failed:`, error);
        if (!res.headersSent) fail(res, 500, String(error));
        else res.end();
      });
      return;
    }
    if (path === "/theme.css" || path === "/wallpaper.jpg") {
      const file = themeFile(paths, core.panel.theme, path.slice(1));
      return existsSync(file) ? sendFile(res, file) : fail(res, 404, "No theme");
    }
    // Anything but the panel itself gets the phone layout.
    if (path === "/" && !isLocal(req)) return res.writeHead(302, { Location: "/phone" }).end();
    const file = join(paths.shell, normalize(path === "/" || path === "/phone" ? "index.html" : path));
    if (!file.startsWith(paths.shell) || !existsSync(file) || !statSync(file).isFile()) return fail(res, 404, "Not found");
    sendFile(res, file);
  });
  server.listen(port, address, () => console.log(`Listening on ${address}:${port}`));
  return server;
}
