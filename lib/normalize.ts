import type { AgentMessage, AssistantMessage, TimelineSummaryMessage, ToolCallContent } from "./types";

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function normalizeToolCallBlock(block: unknown): ToolCallContent | null {
  if (!isObject(block) || block.type !== "toolCall") return null;
  return {
    type: "toolCall",
    toolCallId: typeof block.toolCallId === "string" ? block.toolCallId : (typeof block.id === "string" ? block.id : ""),
    toolName: typeof block.toolName === "string" ? block.toolName : (typeof block.name === "string" ? block.name : ""),
    input: typeof block.input === "object" && block.input !== null && !Array.isArray(block.input)
      ? block.input as Record<string, unknown>
      : (typeof block.arguments === "object" && block.arguments !== null && !Array.isArray(block.arguments)
        ? block.arguments as Record<string, unknown>
        : {}),
  };
}

export function normalizeToolCalls(msg: AgentMessage): AgentMessage {
  if (msg.role !== "assistant") return msg;
  const content = (msg as AssistantMessage).content;
  if (!Array.isArray(content)) return msg;
  const normalized = content.map((block) => {
    const result = normalizeToolCallBlock(block);
    return result ?? block;
  });
  return { ...msg, content: normalized } as AgentMessage;
}

function normalizeTimelineSummary(raw: Record<string, unknown>): TimelineSummaryMessage | null {
  if (raw.role === "timelineSummary" && typeof raw.summary === "string") {
    const kind = raw.kind === "branch" ? "branch" : "compaction";
    return {
      role: "timelineSummary",
      kind,
      summary: raw.summary,
      timestamp: typeof raw.timestamp === "number" ? raw.timestamp : undefined,
    };
  }
  if (raw.role === "compactionSummary") {
    return {
      role: "timelineSummary",
      kind: "compaction",
      summary: String(raw.summary ?? ""),
      timestamp: typeof raw.timestamp === "number" ? raw.timestamp : undefined,
    };
  }
  if (raw.role === "branchSummary") {
    return {
      role: "timelineSummary",
      kind: "branch",
      summary: String(raw.summary ?? ""),
      timestamp: typeof raw.timestamp === "number" ? raw.timestamp : undefined,
    };
  }
  return null;
}

/** Normalize tool-call field names and map compaction/branch summary roles for display. */
export function normalizeAgentMessage(msg: AgentMessage): AgentMessage {
  const raw = msg as unknown as Record<string, unknown>;
  const timeline = normalizeTimelineSummary(raw);
  if (timeline) return timeline;
  return normalizeToolCalls(msg);
}