// byobud's HTTP side: the shell's files, and the API it talks to. On localhost only for now, as
// nothing here asks who's calling. The phone app will need that first.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import type { Core } from "./core.ts";
import { setBacklight } from "./backlight.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const MAX_BODY = 64 * 1024;

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

async function api(core: Core, req: IncomingMessage, res: ServerResponse, path: string) {
  const [, , route, id, sub, name] = path.split("/");

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
      api(core, req, res, path).catch((error) => {
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
    const file = join(paths.shell, normalize(path === "/" ? "index.html" : path));
    if (!file.startsWith(paths.shell) || !existsSync(file) || !statSync(file).isFile()) return fail(res, 404, "Not found");
    sendFile(res, file);
  });
  server.listen(port, address, () => console.log(`Listening on ${address}:${port}`));
  return server;
}
