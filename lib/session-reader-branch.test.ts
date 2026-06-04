import { describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "./types";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => "/tmp/pi-agent",
  SessionManager: {},
  buildSessionContext: () => ({
    messages: [
      { role: "branchSummary", summary: "left branch context", timestamp: 2 },
      { role: "user", content: "kept" },
    ],
    thinkingLevel: "medium",
    model: { provider: "p", modelId: "m" },
  }),
}));

describe("session-reader branch summary", () => {
  it("maps branchSummary to timelineSummary in context", async () => {
    const { buildSessionContext } = await import("./session-reader");
    const entries = [
      { type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "kept" } },
    ] as SessionEntry[];

    const context = buildSessionContext(entries, "u1");

    expect(context.messages[0]).toMatchObject({
      role: "timelineSummary",
      kind: "branch",
      summary: "left branch context",
    });
  });
});
