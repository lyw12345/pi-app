import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import { getAgentDir } from "@/lib/agent-dir";

const FILENAME = "scene-overrides.json";
const SCHEMA_VERSION = 1 as const;

export interface SceneOverrides {
  defaultPrompt?: string | null;
  outputStyle?: string | null;
  suggestedStarters?: string[] | null;
}

export type SceneOverridesMap = Record<string, SceneOverrides>;

interface SceneOverridesFile {
  schemaVersion: number;
  scenes: SceneOverridesMap;
}

declare global {
  var __piSceneOverridesWriteQueue: Promise<unknown> | undefined;
}

// Serialize all scene-overrides reads and writes in the current process.
function serialize<T>(work: () => T | Promise<T>): Promise<T> {
  const previous = globalThis.__piSceneOverridesWriteQueue ?? Promise.resolve();
  const next = previous.then(work, work);
  globalThis.__piSceneOverridesWriteQueue = next.catch(() => undefined);
  return next;
}

function getStorePath(): string {
  return join(getAgentDir(), FILENAME);
}

function readMap(): SceneOverridesMap {
  const path = getStorePath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as Partial<SceneOverridesFile> | null;
    if (!parsed || typeof parsed !== "object") return {};
    const scenes = (parsed as { scenes?: unknown }).scenes;
    if (!scenes || typeof scenes !== "object") return {};
    return scenes as SceneOverridesMap;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[scene-overrides] failed to parse store, treating as empty:", err);
    }
    return {};
  }
}

function writeMap(map: SceneOverridesMap): void {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const payload: SceneOverridesFile = { schemaVersion: SCHEMA_VERSION, scenes: map };
  const tempPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tempPath, path);
}

export function readAllSceneOverrides(): SceneOverridesMap {
  return readMap();
}

export function readSceneOverride(sceneId: string): SceneOverrides | null {
  return readMap()[sceneId] ?? null;
}

export async function upsertSceneOverride(
  sceneId: string,
  partial: SceneOverrides,
): Promise<SceneOverrides> {
  return serialize(() => {
    const map = readMap();
    const previous = map[sceneId] ?? {};
    const merged: SceneOverrides = { ...previous, ...partial };
    map[sceneId] = merged;
    writeMap(map);
    return merged;
  });
}

export async function clearSceneOverride(sceneId: string): Promise<boolean> {
  return serialize(() => {
    const map = readMap();
    if (!(sceneId in map)) return false;
    delete map[sceneId];
    writeMap(map);
    return true;
  });
}
