// Who may use byobud from the network. The panel's own browser is on localhost and needs nothing.
// Anything else needs a token, which it gets by pairing: the panel shows a one-time code as a QR
// code, so getting one takes standing in front of it. Only hashes of tokens are kept.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ClientSummary } from "./protocol.ts";

const CODE_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 60_000;

type Client = ClientSummary & { hash: string };

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class Clients {
  private clients: Client[];
  private readonly file: string;
  private pairing?: { code: string; expires: number };
  private attempts: number[] = [];

  constructor(state: string) {
    this.file = join(state, "clients.json");
    try {
      this.clients = JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      this.clients = [];
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.new`;
    writeFileSync(temporary, JSON.stringify(this.clients, null, 2), { mode: 0o600 });
    renameSync(temporary, this.file);
  }

  // A fresh code replaces any before it.
  startPairing(now = Date.now()) {
    this.pairing = { code: randomBytes(16).toString("hex"), expires: now + CODE_TTL_MS };
    return this.pairing;
  }

  // Returns a new client's token, or nothing. A code works once, and guessing is limited to a
  // few tries a minute, for all callers together.
  pair(code: string, name: string, now = Date.now()): string | undefined {
    this.attempts = this.attempts.filter((time) => now - time < ATTEMPT_WINDOW_MS);
    if (this.attempts.length >= MAX_ATTEMPTS) return undefined;
    this.attempts.push(now);
    const { pairing } = this;
    if (!pairing || now > pairing.expires || !equal(code, pairing.code)) return undefined;
    this.pairing = undefined;
    const token = randomBytes(32).toString("hex");
    this.clients.push({ id: randomUUID(), name: name.slice(0, 60) || "Phone", pairedAt: new Date(now).toISOString(), hash: hashOf(token) });
    this.save();
    return token;
  }

  has(token: string | undefined): boolean {
    if (!token) return false;
    const hash = hashOf(token);
    return this.clients.some((client) => equal(client.hash, hash));
  }

  list(): ClientSummary[] {
    return this.clients.map(({ id, name, pairedAt }) => ({ id, name, pairedAt }));
  }

  remove(id: string) {
    this.clients = this.clients.filter((client) => client.id !== id);
    this.save();
  }
}
