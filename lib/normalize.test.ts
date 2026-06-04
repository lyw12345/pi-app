import { describe, expect, it } from "vitest";
import { normalizeAgentMessage, normalizeToolCalls } from "./normalize";
import type { AgentMessage } from "./types";

describe("normalizeToolCalls", () => {
  it("normalizes persisted pi toolCall blocks to UI field names", () => {
    const message = {
      role: "assistant",
      model: "m",
      provider: "p",
      content: [
        { type: "text", text: "hello" },
        { type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } },
      ],
    } as unknown as AgentMessage;

    expect(normalizeToolCalls(message)).toMatchObject({
      content: [
        { type: "text", text: "hello" },
        { type: "toolCall", toolCallId: "call-1", toolName: "read", input: { path: "README.md" } },
      ],
    });
  });
});

describe("normalizeAgentMessage", () => {
  it("maps compactionSummary to timelineSummary", () => {
    const msg = {
      role: "compactionSummary",
      summary: "kept context",
      timestamp: 42,
    } as unknown as AgentMessage;
    expect(normalizeAgentMessage(msg)).toEqual({
      role: "timelineSummary",
      kind: "compaction",
      summary: "kept context",
      timestamp: 42,
    });
  });

  it("maps branchSummary to timelineSummary", () => {
    const msg = {
      role: "branchSummary",
      summary: "branch left",
    } as unknown as AgentMessage;
    expect(normalizeAgentMessage(msg)).toMatchObject({
      role: "timelineSummary",
      kind: "branch",
      summary: "branch left",
    });
  });
});
