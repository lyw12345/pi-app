import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@/lib/agent-dir";

export type ToolMode = "simple" | "default" | "full";

export interface PiWebPreferences {
  onboardingCompletedAt?: string;
  defaultWorkspaceCwd?: string;
  toolMode?: ToolMode;
  notificationsEnabled?: boolean;
  lastOpenedSceneId?: string;
  autoCompactionEnabled?: boolean;
  autoRetryEnabled?: boolean;
}

export const PI_WEB_PREFERENCES_FILENAME = "pi-web-preferences.json";

function preferencesPath(): string {
  return join(getAgentDir(), PI_WEB_PREFERENCES_FILENAME);
}

export function loadPiWebPreferences(): PiWebPreferences {
  try {
    const raw = readFileSync(preferencesPath(), "utf8");
    const parsed = JSON.parse(raw) as PiWebPreferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePiWebPreferences(next: PiWebPreferences): PiWebPreferences {
  const path = preferencesPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return next;
}

export function mergePiWebPreferences(patch: Partial<PiWebPreferences>): PiWebPreferences {
  const current = loadPiWebPreferences();
  const next: PiWebPreferences = { ...current, ...patch };
  return savePiWebPreferences(next);
}

export function defaultToolMode(): ToolMode {
  return loadPiWebPreferences().toolMode ?? "simple";
}

export function defaultAutoCompactionEnabled(): boolean {
  const prefs = loadPiWebPreferences();
  return prefs.autoCompactionEnabled !== false;
}

export function defaultAutoRetryEnabled(): boolean {
  const prefs = loadPiWebPreferences();
  return prefs.autoRetryEnabled !== false;
}
