import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ProductSessionMetadata, ProductSessionMetadataMap } from "./scenes";

const FILENAME = "product-sessions.json";

declare global {
  // eslint-disable-next-line no-var
  var __piProductSessionWriteQueue: Promise<unknown> | undefined;
}

// Serialize all product-session-metadata reads and writes in the current
// process. Two concurrent `upsertProductSessionMetadata` calls could
// otherwise read the same file, both compute a new state, and the second
// writeFileSync would silently drop the first mutation.
function serialize<T>(work: () => T | Promise<T>): Promise<T> {
  const previous = globalThis.__piProductSessionWriteQueue ?? Promise.resolve();
  const next = previous.then(work, work);
  // Swallow rejection on the queue head so it never blocks the chain, but
  // propagate via the returned promise so callers can handle it.
  globalThis.__piProductSessionWriteQueue = next.catch(() => undefined);
  return next;
}

function getStorePath(): string {
  return join(getAgentDir(), FILENAME);
}

function readMap(): ProductSessionMetadataMap {
  const path = getStorePath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as ProductSessionMetadataMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    // Corrupt store: warn and start fresh; the next write will recover the file.
    if (typeof console !== "undefined") {
      console.warn("[scene-metadata] failed to parse store, treating as empty:", err);
    }
    return {};
  }
}

function writeMap(map: ProductSessionMetadataMap): void {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true });
  // Atomic-ish: write to a temp file then rename. Avoids partial writes
  // tearing on crash, and prevents a concurrent reader from seeing
  // half-written JSON.
  const tempPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(map, null, 2), "utf8");
  // renameSync is atomic on POSIX and atomically overwrites on Windows.
  renameSync(tempPath, path);
}

export function readProductSessionMetadata(sessionId: string): ProductSessionMetadata | null {
  return readMap()[sessionId] ?? null;
}

export function readAllProductSessionMetadata(): ProductSessionMetadataMap {
  return readMap();
}

// Back-compat alias: previous callers did `readProductSessionMetadata()` to
// fetch the entire map. Keep that name working for the route handlers and
// `listAllSessions` that pre-date the split.
export const readProductSessionMetadataMap = readAllProductSessionMetadata;

export async function upsertProductSessionMetadata(
  sessionId: string,
  metadata: ProductSessionMetadata,
): Promise<void> {
  await serialize(() => {
    const map = readMap();
    const previous = map[sessionId];
    map[sessionId] = {
      ...previous,
      ...metadata,
      startedAt: previous?.startedAt ?? metadata.startedAt,
    };
    writeMap(map);
  });
}

export async function deleteProductSessionMetadata(sessionId: string): Promise<void> {
  await serialize(() => {
    const map = readMap();
    if (!(sessionId in map)) return;
    delete map[sessionId];
    writeMap(map);
  });
}
