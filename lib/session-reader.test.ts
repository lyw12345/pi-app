import { describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "./types";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => "/tmp/pi-agent",
  SessionManager: {},
  buildSessionContext: () => ({
    messages: [
      { role: "compactionSummary", summary: "older summary", timestamp: 1 },
      { role: "user", content: "kept" },
      { role: "assistant", model: "m", provider: "p", content: [{ type: "text", text: "new" }] },
    ],
    thinkingLevel: "medium",
    model: { provider: "p", modelId: "m" },
  }),
}));

describe("session-reader", () => {
  it("applies the latest label entry while building trees", async () => {
    const { buildTree } = await import("./session-reader");
    const entries = [
      { type: "message", id: "root", parentId: null, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "hi" } },
      { type: "label", id: "l1", parentId: "root", timestamp: "2026-01-01T00:00:01Z", targetId: "root", label: "First" },
      { type: "label", id: "l2", parentId: "root", timestamp: "2026-01-01T00:00:02Z", targetId: "root", label: "Current" },
    ] as SessionEntry[];

    expect(buildTree(entries)[0].label).toBe("Current");
  });

  it("keeps entryIds parallel to compacted context messages", async () => {
    const { buildSessionContext } = await import("./session-reader");
    const entries = [
      { type: "message", id: "old", parentId: null, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "old" } },
      { type: "message", id: "kept", parentId: "old", timestamp: "2026-01-01T00:00:01Z", message: { role: "user", content: "kept" } },
      { type: "compaction", id: "cmp", parentId: "kept", timestamp: "2026-01-01T00:00:02Z", summary: "older summary", firstKeptEntryId: "kept", tokensBefore: 10 },
      { type: "message", id: "new", parentId: "cmp", timestamp: "2026-01-01T00:00:03Z", message: { role: "assistant", model: "m", provider: "p", content: [] } },
    ] as SessionEntry[];

    const context = buildSessionContext(entries, "new");

    expect(context.entryIds).toEqual(["cmp", "kept", "new"]);
    expect(context.messages[0]).toMatchObject({
      role: "timelineSummary",
      kind: "compaction",
      summary: "older summary",
    });
  });
});
