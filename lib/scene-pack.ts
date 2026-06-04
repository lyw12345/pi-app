import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isKnownSceneId, type SceneOverrides } from "@/lib/scenes";
import { SCENE_OVERRIDE_SCHEMA_VERSION, sanitizeSceneOverrideFields, type SceneOverridesMap } from "@/lib/scene-overrides";

export const SCENE_PACK_SCHEMA_VERSION = 1;

export interface ScenePackV1 {
  schemaVersion: typeof SCENE_PACK_SCHEMA_VERSION;
  exportedAt?: string;
  piWebVersion?: string;
  scenes: SceneOverridesMap;
}

export type ScenePackChangeAction = "create" | "update" | "unchanged";

export interface ScenePackChange {
  sceneId: string;
  action: ScenePackChangeAction;
  fields: string[];
}

export function readPiWebVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function buildScenePack(overrides: SceneOverridesMap, sceneId?: string | null): ScenePackV1 {
  const scenes: SceneOverridesMap = {};
  if (sceneId) {
    const one = overrides[sceneId];
    if (one) scenes[sceneId] = { ...one };
  } else {
    for (const [id, override] of Object.entries(overrides)) {
      scenes[id] = { ...override };
    }
  }
  return {
    schemaVersion: SCENE_PACK_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    piWebVersion: readPiWebVersion(),
    scenes,
  };
}

export function validateScenePack(input: unknown): { ok: true; pack: ScenePackV1 } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Scene pack must be a JSON object" };
  }
  const body = input as Record<string, unknown>;
  if (body.schemaVersion !== SCENE_PACK_SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported schemaVersion (expected ${SCENE_PACK_SCHEMA_VERSION})` };
  }
  if (!body.scenes || typeof body.scenes !== "object" || Array.isArray(body.scenes)) {
    return { ok: false, error: "Scene pack must include a scenes object" };
  }

  const scenes: SceneOverridesMap = {};
  for (const [sceneId, override] of Object.entries(body.scenes as Record<string, unknown>)) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
      return { ok: false, error: `Invalid override for scene "${sceneId}"` };
    }
    scenes[sceneId] = sanitizeSceneOverrideFields(override as SceneOverrides);
  }

  return {
    ok: true,
    pack: {
      schemaVersion: SCENE_PACK_SCHEMA_VERSION,
      exportedAt: typeof body.exportedAt === "string" ? body.exportedAt : undefined,
      piWebVersion: typeof body.piWebVersion === "string" ? body.piWebVersion : undefined,
      scenes,
    },
  };
}

function overrideFieldNames(override: SceneOverrides): string[] {
  const fields: string[] = [];
  if ("defaultPrompt" in override) fields.push("defaultPrompt");
  if ("outputStyle" in override) fields.push("outputStyle");
  if ("suggestedStarters" in override) fields.push("suggestedStarters");
  return fields;
}

function overridesEqual(a: SceneOverrides | undefined, b: SceneOverrides): boolean {
  if (!a) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function previewScenePackImport(
  current: SceneOverridesMap,
  pack: ScenePackV1,
): { unknownSceneIds: string[]; changes: ScenePackChange[] } {
  const unknownSceneIds: string[] = [];
  const changes: ScenePackChange[] = [];

  for (const sceneId of Object.keys(pack.scenes)) {
    if (!isKnownSceneId(sceneId)) {
      unknownSceneIds.push(sceneId);
      continue;
    }
    const incoming = pack.scenes[sceneId];
    const existing = current[sceneId];
    if (!existing) {
      changes.push({ sceneId, action: "create", fields: overrideFieldNames(incoming) });
      continue;
    }
    if (overridesEqual(existing, incoming)) {
      changes.push({ sceneId, action: "unchanged", fields: overrideFieldNames(incoming) });
      continue;
    }
    changes.push({ sceneId, action: "update", fields: overrideFieldNames(incoming) });
  }

  return { unknownSceneIds, changes };
}
