import type { TextContent, UserMessage } from "@/lib/types";
import { stripFileRefsForDisplay, type FilePathRef } from "@/lib/message-file-refs";

/** Matches pi-coding-agent `parseSkillBlock` user-message format. */
const SKILL_BLOCK_RE =
  /^<skill name="([^"]+)" location="[^"]*">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/;

const SLASH_SKILL_RE = /^\/skill:([\w.-]+)$/;

/** Legacy expanded `/team` prompt template (pre team-entry extension). */
const TEAM_PROMPT_HEADER = /^你是 pi-agent 的 `\/team` 入口/;

function collapseExpandedTeamPrompt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!TEAM_PROMPT_HEADER.test(trimmed)) return null;

  const demandMatch = trimmed.match(/## 需求[：:]\s*([\s\S]+)$/);
  if (demandMatch) {
    const args = demandMatch[1].trim();
    return args ? `/team ${args}` : "/team";
  }

  return "/team";
}

/** Collapse expanded skill payloads to a short label for the chat UI. */
export function displayUserMessageText(raw: string): string {
  const trimmed = raw.trim();
  if (SLASH_SKILL_RE.test(trimmed)) {
    return trimmed;
  }
  const teamCollapsed = collapseExpandedTeamPrompt(trimmed);
  if (teamCollapsed) return teamCollapsed;
  const block = trimmed.match(SKILL_BLOCK_RE);
  if (block) {
    const trailing = block[2]?.trim();
    if (trailing) return stripFileRefsForDisplay(trailing).text;
    return `/skill:${block[1]}`;
  }
  return stripFileRefsForDisplay(raw).text;
}

export function displayUserMessageFilePaths(content: UserMessage["content"]): FilePathRef[] {
  const raw = extractUserMessageText(content);
  return stripFileRefsForDisplay(raw).refs;
}

export function extractUserMessageText(content: UserMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export function displayUserMessageContent(content: UserMessage["content"]): string {
  return displayUserMessageText(extractUserMessageText(content));
}
