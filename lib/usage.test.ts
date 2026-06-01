import { describe, expect, it } from "vitest";
import type { ProductHistoryItem } from "./scenes";
import { buildUsageSummary } from "./usage";

const history: ProductHistoryItem[] = [
  {
    sessionId: "s1",
    path: "/tmp/s1.jsonl",
    cwd: "/work",
    sceneId: "enterprise-knowledge",
    sceneName: "Enterprise Knowledge Assistant",
    title: "Policy answer",
    status: "completed",
    summary: "Answered with caveats",
    startedAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-01T08:05:00.000Z",
    messageCount: 5,
    firstMessage: "Can I share this policy?",
  },
  {
    sessionId: "s2",
    path: "/tmp/s2.jsonl",
    cwd: "/work",
    sceneId: "report-generation",
    sceneName: "Report Generation Assistant",
    title: "Weekly summary",
    status: "active",
    summary: "Drafted report",
    startedAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:10:00.000Z",
    messageCount: 3,
    firstMessage: "Draft a report",
  },
  {
    sessionId: "s3",
    path: "/tmp/s3.jsonl",
    cwd: "/work",
    sceneId: "enterprise-knowledge",
    sceneName: "Enterprise Knowledge Assistant",
    title: "Source check",
    status: "active",
    summary: "Checked source conflict",
    startedAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:20:00.000Z",
    messageCount: 7,
    firstMessage: "Compare these docs",
  },
  {
    sessionId: "s4",
    path: "/tmp/s4.jsonl",
    cwd: "/work",
    sceneId: null,
    sceneName: "General Chat",
    title: "Unscoped chat",
    status: "active",
    summary: "General question",
    startedAt: "2026-06-01T11:00:00.000Z",
    updatedAt: "2026-06-01T11:02:00.000Z",
    messageCount: 1,
    firstMessage: "Hello",
  },
];

describe("usage summary", () => {
  it("summarizes scene adoption without counting general chats as scene usage", () => {
    const summary = buildUsageSummary(history, "2026-06-01T12:00:00.000Z");

    expect(summary).toMatchObject({
      totalRuns: 4,
      sceneRuns: 3,
      generalRuns: 1,
      activeRuns: 3,
      completedRuns: 1,
      generatedAt: "2026-06-01T12:00:00.000Z",
    });
    expect(summary.sceneAdoptionRate).toBeCloseTo(0.75);
    expect(summary.byScene).toEqual([
      {
        sceneId: "enterprise-knowledge",
        sceneName: "Enterprise Knowledge Assistant",
        runs: 2,
        activeRuns: 1,
        completedRuns: 1,
        lastUsedAt: "2026-06-01T10:20:00.000Z",
        totalMessages: 12,
      },
      {
        sceneId: "report-generation",
        sceneName: "Report Generation Assistant",
        runs: 1,
        activeRuns: 1,
        completedRuns: 0,
        lastUsedAt: "2026-06-01T09:10:00.000Z",
        totalMessages: 3,
      },
    ]);
  });

  it("returns a stable empty state when no work has happened", () => {
    expect(buildUsageSummary([], "2026-06-01T12:00:00.000Z")).toEqual({
      totalRuns: 0,
      sceneRuns: 0,
      generalRuns: 0,
      activeRuns: 0,
      completedRuns: 0,
      sceneAdoptionRate: 0,
      generatedAt: "2026-06-01T12:00:00.000Z",
      byScene: [],
    });
  });
});
