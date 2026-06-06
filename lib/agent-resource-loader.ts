import {
  DefaultResourceLoader,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@/lib/agent-dir";
import { PI_WEB_SKILL_WORKFLOW_APPEND } from "@/lib/skill-system-prompt";

/** Resource loader for in-process AgentSession; adds Pi Web skill workflow guidance. */
export async function createAgentResourceLoader(cwd: string): Promise<ResourceLoader> {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    appendSystemPrompt: [PI_WEB_SKILL_WORKFLOW_APPEND],
  });
  await loader.reload();
  return loader;
}
