import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { getAgentDir } from "@/lib/agent-dir";
import { sanitizePromptInput } from "@/lib/prompt-guard";
import { isKnownSceneId, type SceneOverrides } from "@/lib/scenes";

export type { SceneOverrides } from "@/lib/scenes";

export type SceneOverridesMap = Record<string, SceneOverrides>;

const FILENAME = "scene-overrides.json";
export const SCENE_OVERRIDE_SCHEMA_VERSION = 1;

const MAX_DEFAULT_PROMPT = 16_000;
const MAX_OUTPUT_STYLE = 500;
const MAX_STARTER_ITEM = 200;
const MAX_STARTERS = 8;

interface SceneOverridesFile {
  schemaVersion: number;
  scenes: SceneOverridesMap;
}

declare global {
  var __piSceneOverridesWriteQueue: Promise<unknown> | undefined;
}

function serialize<T>(work: () => T | Promise<T>): Promise<T> {
  const previous = globalThis.__piSceneOverridesWriteQueue ?? Promise.resolve();
  const next = previous.then(work, work);
  globalThis.__piSceneOverridesWriteQueue = next.catch(() => undefined);
  return next;
}

function getStorePath(): string {
  return join(getAgentDir(), FILENAME);
}

function readFile(): SceneOverridesFile {
  const path = getStorePath();
  if (!existsSync(path)) {
    return { schemaVersion: SCENE_OVERRIDE_SCHEMA_VERSION, scenes: {} };
  }
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) {
      return { schemaVersion: SCENE_OVERRIDE_SCHEMA_VERSION, scenes: {} };
    }
    const parsed = JSON.parse(raw) as Partial<SceneOverridesFile>;
    const scenes = parsed.scenes && typeof parsed.scenes === "object" ? parsed.scenes : {};
    return {
      schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : SCENE_OVERRIDE_SCHEMA_VERSION,
      scenes,
    };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[scene-overrides] failed to parse store, treating as empty:", err);
    }
    return { schemaVersion: SCENE_OVERRIDE_SCHEMA_VERSION, scenes: {} };
  }
}

function writeFile(data: SceneOverridesFile): void {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

export function readSceneOverrides(): SceneOverridesMap {
  return { ...readFile().scenes };
}

export function readSceneOverride(sceneId: string): SceneOverrides | null {
  const override = readFile().scenes[sceneId];
  return override ? { ...override } : null;
}

export function sanitizeSceneOverrideFields(input: Partial<SceneOverrides>): SceneOverrides {
  const next: SceneOverrides = {};
  if ("defaultPrompt" in input) {
    next.defaultPrompt =
      input.defaultPrompt === null
        ? null
        : sanitizePromptInput(input.defaultPrompt, { maxChars: MAX_DEFAULT_PROMPT, onTruncate: "none" });
  }
  if ("outputStyle" in input) {
    next.outputStyle =
      input.outputStyle === null
        ? null
        : sanitizePromptInput(input.outputStyle, { maxChars: MAX_OUTPUT_STYLE, onTruncate: "none" });
  }
  if ("suggestedStarters" in input) {
    if (input.suggestedStarters === null) {
      next.suggestedStarters = null;
    } else if (Array.isArray(input.suggestedStarters)) {
      next.suggestedStarters = input.suggestedStarters
        .slice(0, MAX_STARTERS)
        .map((item) => sanitizePromptInput(String(item), { maxChars: MAX_STARTER_ITEM, onTruncate: "none" }))
        .filter((item) => item.length > 0);
    }
  }
  return next;
}

export function validateSceneOverrideBody(body: unknown): { ok: true; value: SceneOverrides } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const input = body as Record<string, unknown>;
  const hasDefaultPrompt = "defaultPrompt" in input;
  const hasOutputStyle = "outputStyle" in input;
  const hasStarters = "suggestedStarters" in input;
  if (!hasDefaultPrompt && !hasOutputStyle && !hasStarters) {
    return { ok: false, error: "At least one override field is required" };
  }

  const value = sanitizeSceneOverrideFields({
    defaultPrompt: hasDefaultPrompt ? (input.defaultPrompt as string | null) : undefined,
    outputStyle: hasOutputStyle ? (input.outputStyle as string | null) : undefined,
    suggestedStarters: hasStarters ? (input.suggestedStarters as string[] | null) : undefined,
  });

  if (hasDefaultPrompt && typeof input.defaultPrompt === "string" && input.defaultPrompt.length > MAX_DEFAULT_PROMPT) {
    return { ok: false, error: `defaultPrompt exceeds ${MAX_DEFAULT_PROMPT} characters` };
  }
  if (hasOutputStyle && typeof input.outputStyle === "string" && input.outputStyle.length > MAX_OUTPUT_STYLE) {
    return { ok: false, error: `outputStyle exceeds ${MAX_OUTPUT_STYLE} characters` };
  }
  if (Array.isArray(input.suggestedStarters)) {
    if (input.suggestedStarters.length > MAX_STARTERS) {
      return { ok: false, error: `suggestedStarters allows at most ${MAX_STARTERS} items` };
    }
    for (const item of input.suggestedStarters) {
      if (typeof item === "string" && item.length > MAX_STARTER_ITEM) {
        return { ok: false, error: `Each suggested starter must be at most ${MAX_STARTER_ITEM} characters` };
      }
    }
  }

  return { ok: true, value };
}

export async function upsertSceneOverride(sceneId: string, partial: SceneOverrides): Promise<SceneOverrides> {
  if (!isKnownSceneId(sceneId)) {
    throw new Error(`Unknown scene: ${sceneId}`);
  }
  return serialize(() => {
    const file = readFile();
    const previous = file.scenes[sceneId] ?? {};
    const merged: SceneOverrides = { ...previous, ...partial };
    file.scenes[sceneId] = merged;
    writeFile(file);
    return { ...merged };
  });
}

export async function clearSceneOverride(sceneId: string): Promise<boolean> {
  if (!isKnownSceneId(sceneId)) {
    throw new Error(`Unknown scene: ${sceneId}`);
  }
  return serialize(() => {
    const file = readFile();
    if (!(sceneId in file.scenes)) return false;
    delete file.scenes[sceneId];
    writeFile(file);
    return true;
  });
}

export async function replaceSceneOverrides(nextScenes: SceneOverridesMap): Promise<number> {
  return serialize(() => {
    const sanitized: SceneOverridesMap = {};
    for (const [sceneId, override] of Object.entries(nextScenes)) {
      if (!isKnownSceneId(sceneId)) continue;
      sanitized[sceneId] = sanitizeSceneOverrideFields(override);
    }
    writeFile({ schemaVersion: SCENE_OVERRIDE_SCHEMA_VERSION, scenes: sanitized });
    return Object.keys(sanitized).length;
  });
}

export async function mergeSceneOverrides(partialMap: SceneOverridesMap): Promise<{ applied: number; skipped: number }> {
  return serialize(() => {
    const file = readFile();
    let applied = 0;
    let skipped = 0;
    for (const [sceneId, override] of Object.entries(partialMap)) {
      if (!isKnownSceneId(sceneId)) {
        skipped += 1;
        continue;
      }
      file.scenes[sceneId] = {
        ...(file.scenes[sceneId] ?? {}),
        ...sanitizeSceneOverrideFields(override),
      };
      applied += 1;
    }
    writeFile(file);
    return { applied, skipped };
  });
}
