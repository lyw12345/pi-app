import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@/lib/agent-dir";

export interface SessionShareRecord {
  sessionId: string;
  createdAt: string;
}

type ShareStore = Record<string, SessionShareRecord>;

const SHARES_FILENAME = "session-shares.json";

function sharesPath(): string {
  return join(getAgentDir(), SHARES_FILENAME);
}

function readStore(): ShareStore {
  const path = sharesPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ShareStore;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeStore(store: ShareStore): void {
  const path = sharesPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
}

function newToken(): string {
  return randomBytes(16).toString("hex");
}

export function createSessionShare(sessionId: string): string {
  const store = readStore();
  const existing = Object.entries(store).find(([, rec]) => rec.sessionId === sessionId);
  if (existing) return existing[0];

  let token = newToken();
  while (store[token]) {
    token = newToken();
  }
  store[token] = { sessionId, createdAt: new Date().toISOString() };
  writeStore(store);
  return token;
}

export function resolveSessionShare(token: string): SessionShareRecord | null {
  const rec = readStore()[token];
  return rec?.sessionId ? rec : null;
}
