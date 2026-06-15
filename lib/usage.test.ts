import { describe, expect, it } from "vitest";
import type { ProductHistoryItem } from "./product-history";
import { buildUsageSummary, buildUsageTimeline } from "./usage";

const history: ProductHistoryItem[] = [
  {
    sessionId: "s1",
    path: "/tmp/s1.jsonl",
    cwd: "/work",
    projectName: "work",
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
    projectName: "work",
    title: "Weekly summary",
    status: "active",
    summary: "Drafted report",
    startedAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T09:10:00.000Z",
    messageCount: 3,
    firstMessage: "Draft a report",
  },
];

describe("usage summary", () => {
  it("counts total conversation runs", () => {
    const summary = buildUsageSummary(history, "2026-06-01T12:00:00.000Z");

    expect(summary).toEqual({
      totalRuns: 2,
      activeRuns: 1,
      completedRuns: 1,
      generatedAt: "2026-06-01T12:00:00.000Z",
    });
  });

  it("returns a stable empty state when no work has happened", () => {
    expect(buildUsageSummary([], "2026-06-01T12:00:00.000Z")).toEqual({
      totalRuns: 0,
      activeRuns: 0,
      completedRuns: 0,
      generatedAt: "2026-06-01T12:00:00.000Z",
    });
  });
});

describe("usage timeline", () => {
  it("builds seven day buckets with started and completed counts", () => {
    const timeline = buildUsageTimeline(history, 7, "2026-06-01T12:00:00.000Z");
    expect(timeline.days).toHaveLength(7);
    const june1 = timeline.days.find((d) => d.date === "2026-06-01");
    expect(june1?.started).toBe(2);
    expect(june1?.completed).toBe(1);
    expect(june1?.active).toBe(1);
  });
});
