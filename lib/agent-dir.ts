import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Default pi agent dir (~/.pi/agent), regardless of PI_CODING_AGENT_DIR. */
export function getDefaultAgentDir(): string {
  return join(homedir(), ".pi", "agent");
}

/** Matches @earendil-works/pi-coding-agent getAgentDir() without importing the package. */
export function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    if (envDir === "~") return homedir();
    if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
    return envDir;
  }
  return getDefaultAgentDir();
}

/** True when dev uses an isolated agent dir (e.g. 30142 vs 30141). */
export function usesIsolatedAgentDataDir(): boolean {
  return resolve(getAgentDir()) !== resolve(getDefaultAgentDir());
}
