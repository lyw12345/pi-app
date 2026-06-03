import { homedir } from "node:os";
import { join } from "node:path";

/** Matches @earendil-works/pi-coding-agent getAgentDir() without importing the package. */
export function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    if (envDir === "~") return homedir();
    if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
    return envDir;
  }
  return join(homedir(), ".pi", "agent");
}
