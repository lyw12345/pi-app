import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@/lib/agent-dir";

export type ToolMode = "simple" | "default" | "full";

export interface PiWebPreferences {
  defaultWorkspaceCwd?: string;
  /** Directories the user explicitly opened, most-recent-first. Lets the file
   *  API authorize them and the project picker list them before any session
   *  exists for that directory. */
  recentWorkspaceCwds?: string[];
  toolMode?: ToolMode;
  notificationsEnabled?: boolean;
  /** When true, in-session branch switches call navigate_tree with summarize (default off). */
  branchSummarizeBeforeSwitch?: boolean;
  /** When true, macOS Pi.app holds a system idle-sleep-preventing power
   *  assertion for the whole app session (not just while a task is running). */
  keepAwakeAlways?: boolean;
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
  return loadPiWebPreferences().toolMode ?? "full";
}

export const MAX_RECENT_WORKSPACE_CWDS = 20;

/**
 * Record a directory the user explicitly opened so it can be authorized by the
 * file API and surfaced in the project picker even before it has a saved
 * session. Stored most-recent-first, de-duplicated, and capped.
 */
export function rememberWorkspaceCwd(cwd: string): PiWebPreferences {
  const trimmed = cwd.trim();
  if (!trimmed) return loadPiWebPreferences();
  const current = loadPiWebPreferences();
  const previous = current.recentWorkspaceCwds ?? [];
  const recentWorkspaceCwds = [trimmed, ...previous.filter((entry) => entry !== trimmed)]
    .slice(0, MAX_RECENT_WORKSPACE_CWDS);
  return savePiWebPreferences({ ...current, recentWorkspaceCwds });
}
