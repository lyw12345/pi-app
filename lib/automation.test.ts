import { describe, expect, it } from "vitest";
import { buildAutomationRunPrompt, getAutomationById, getAutomationEntries } from "./automation";

describe("automation entries", () => {
  it("defines manual operational hooks tied to the first-release scenes", () => {
    const entries = getAutomationEntries();

    expect(entries.map((entry) => entry.id)).toEqual([
      "weekly-report-digest",
      "customer-follow-up-draft",
      "process-review-checklist",
    ]);
    expect(entries[0]).toMatchObject({
      sceneId: "report-generation",
      trigger: "manual",
      enabled: true,
    });
    expect(entries.every((entry) => entry.actionIds.length > 0)).toBe(true);
    expect(getAutomationById("missing")).toBeNull();
  });

  it("builds a scene-aware prompt for a manual automation run", () => {
    const entry = getAutomationById("weekly-report-digest");
    expect(entry).not.toBeNull();

    const prompt = buildAutomationRunPrompt(entry!, {
      input: "Use revenue, churn, and launch notes from this week.",
      requestedBy: "ops@example.com",
    });

    expect(prompt).toContain("Automation: Weekly report digest");
    expect(prompt).toContain("Scene: Report Generation Assistant");
    expect(prompt).toContain("Trigger: Manual");
    expect(prompt).toContain("Requested by: ops@example.com");
    expect(prompt).toContain("Use revenue, churn, and launch notes from this week.");
    expect(prompt).toContain("Expected output:");
  });
});
