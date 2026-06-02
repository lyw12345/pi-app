import { describe, expect, it } from "vitest";
import type { SessionInfo } from "./types";
import {
  buildHistoryItems,
  buildMarkdownExport,
  buildSceneLaunchMessage,
  getActionById,
  getSceneById,
  getSceneByIdWithOverride,
  getScenes,
  getScenesWithOverrides,
  mergeSceneWithOverride,
  summarizeOutputStyle,
  titleFromMessage,
} from "./scenes";

describe("scene domain configuration", () => {
  it("defines the first-release business scenes with distinct framing", () => {
    const scenes = getScenes();

    expect(scenes.map((scene) => scene.id)).toEqual([
      "enterprise-knowledge",
      "report-generation",
      "customer-communication",
      "process-execution",
    ]);
    expect(getSceneById("enterprise-knowledge")).toMatchObject({
      name: "Enterprise Knowledge Assistant",
      entryMode: "chat",
      status: "active",
    });
    expect(getSceneById("report-generation")?.suggestedStarters.length).toBeGreaterThanOrEqual(3);
    expect(getSceneById("missing")).toBeNull();
  });

  it("keeps scene actions user-facing and enabled through action ids", () => {
    const knowledge = getSceneById("enterprise-knowledge");
    expect(knowledge).not.toBeNull();

    const actions = knowledge!.actionIds.map((id) => getActionById(id));

    expect(actions.every(Boolean)).toBe(true);
    expect(actions.map((action) => action?.label)).toContain("Copy answer");
    expect(actions.map((action) => action?.label)).toContain("Export result");
    expect(actions.every((action) => action?.enabled)).toBe(true);
  });
});

describe("scene launch mapping", () => {
  it("wraps a user request with scene purpose, output style, sources, and actions", () => {
    const scene = getSceneById("report-generation");
    expect(scene).not.toBeNull();

    const message = buildSceneLaunchMessage(scene!, "Create a weekly sales summary.");

    expect(message).toContain("Scene: Report Generation Assistant");
    expect(message).toContain("Create executive-ready reports");
    expect(message).toContain("Output style:");
    expect(message).toContain("Create a weekly sales summary.");
    expect(message).toContain("Available user-facing actions:");
  });

  it("strips control characters and excessive length from the user request", () => {
    const scene = getSceneById("enterprise-knowledge");
    expect(scene).not.toBeNull();

    const dirty = "hi\u0000\u0007there\n" + "x".repeat(20_000) + "\u007F";
    const message = buildSceneLaunchMessage(scene!, dirty);

    expect(message).not.toContain("\u0000");
    expect(message).not.toContain("\u0007");
    expect(message).not.toContain("\u007F");
    expect(message).toMatch(/\[truncated \d+ chars\]$/m);
    expect(message.length).toBeLessThan(20_000);
  });

  it("orders the launch prompt: scene → instructions → output style → user request", () => {
    const scene = getSceneById("report-generation");
    expect(scene).not.toBeNull();
    const message = buildSceneLaunchMessage(scene!, "Generate a report.");
    const idxScene = message.indexOf("Scene:");
    const idxOutput = message.indexOf("Output style:");
    const idxUser = message.indexOf("User request:");
    expect(idxScene).toBeGreaterThanOrEqual(0);
    expect(idxScene).toBeLessThan(idxOutput);
    expect(idxOutput).toBeLessThan(idxUser);
  });

  it("returns the static scene when no override is present", () => {
    const scene = getSceneById("report-generation");
    expect(scene).not.toBeNull();
    const direct = mergeSceneWithOverride(
      {
        id: "report-generation",
        name: "x",
        description: "y",
        category: "z",
        entryMode: "chat",
        defaultPrompt: "static prompt",
        sourceIds: [],
        actionIds: [],
        outputStyle: "static style",
        suggestedStarters: [],
        status: "active",
      },
      null,
    );
    expect(direct).toMatchObject({ defaultPrompt: "static prompt", outputStyle: "static style" });
    expect(scene?.defaultPrompt).toBe(direct.defaultPrompt);
  });

  it("merges an override and treats null as 'keep static'", () => {
    const base = {
      id: "report-generation",
      name: "x",
      description: "y",
      category: "z",
      entryMode: "chat" as const,
      defaultPrompt: "static prompt",
      sourceIds: [],
      actionIds: [],
      outputStyle: "static style",
      suggestedStarters: [{ id: "s", label: "S", prompt: "static" }],
      status: "active" as const,
    };
    const merged = mergeSceneWithOverride(base, {
      outputStyle: "custom style",
      defaultPrompt: null,
    });
    expect(merged.outputStyle).toBe("custom style");
    expect(merged.defaultPrompt).toBe("static prompt");
    expect(merged.suggestedStarters).toEqual(base.suggestedStarters);
  });

  it("getSceneByIdWithOverride returns the static scene when the override is null", () => {
    const staticScene = getSceneById("report-generation");
    const merged = getSceneByIdWithOverride("report-generation", null);
    expect(merged).toEqual(staticScene);
  });

  it("getSceneByIdWithOverride returns null for an unknown sceneId regardless of override", () => {
    expect(getSceneByIdWithOverride("not-a-scene", { outputStyle: "X" })).toBeNull();
  });

  it("getSceneByIdWithOverride applies the override to the requested field", () => {
    const merged = getSceneByIdWithOverride("report-generation", {
      outputStyle: "Markdown only",
    });
    expect(merged?.outputStyle).toBe("Markdown only");
    expect(merged?.defaultPrompt).toBe(getSceneById("report-generation")?.defaultPrompt);
  });

  it("getScenesWithOverrides applies overrides per scene and leaves others untouched", () => {
    const all = getScenesWithOverrides({
      "report-generation": { outputStyle: "Markdown only" },
    });
    const report = all.find((scene) => scene.id === "report-generation");
    const other = all.find((scene) => scene.id !== "report-generation");
    expect(report?.outputStyle).toBe("Markdown only");
    expect(other?.outputStyle).toBe(getScenes().find((scene) => scene.id === other?.id)?.outputStyle);
  });
});

describe("scene history and export helpers", () => {
  it("maps runtime sessions to business-facing history records", () => {
    const sessions: SessionInfo[] = [
      {
        id: "s1",
        path: "/tmp/s1.jsonl",
        cwd: "/work",
        created: "2026-06-01T10:00:00.000Z",
        modified: "2026-06-01T10:05:00.000Z",
        messageCount: 4,
        firstMessage: "What changed in policy?",
      },
      {
        id: "s2",
        path: "/tmp/s2.jsonl",
        cwd: "/work",
        created: "2026-06-01T11:00:00.000Z",
        modified: "2026-06-01T11:10:00.000Z",
        messageCount: 2,
        firstMessage: "Draft a report",
      },
    ];

    const items = buildHistoryItems(sessions, {
      s1: {
        sceneId: "enterprise-knowledge",
        title: "Policy Q&A",
        status: "completed",
        lastResultSummary: "Answered with source guidance",
        startedAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:08:00.000Z",
      },
    });

    expect(items[0]).toMatchObject({
      sessionId: "s1",
      sceneId: "enterprise-knowledge",
      sceneName: "Enterprise Knowledge Assistant",
      title: "Policy Q&A",
      status: "completed",
      summary: "Answered with source guidance",
    });
    expect(items[1]).toMatchObject({
      sessionId: "s2",
      sceneId: null,
      sceneName: "General Chat",
      title: "Draft a report",
      status: "active",
    });
  });

  it("exports scene results as markdown with business context", () => {
    const scene = getSceneById("enterprise-knowledge");
    expect(scene).not.toBeNull();

    const markdown = buildMarkdownExport({
      scene: scene!,
      title: "Policy answer",
      content: "Employees can request access through the service desk.",
      generatedAt: "2026-06-01T12:00:00.000Z",
    });

    expect(markdown).toContain("# Policy answer");
    expect(markdown).toContain("Scene: Enterprise Knowledge Assistant");
    expect(markdown).toContain("Employees can request access");
  });
});

describe("title and output style helpers", () => {
  it("titleFromMessage returns a sanitized, truncated first line", () => {
    expect(titleFromMessage("", "fallback")).toBe("fallback");
    expect(titleFromMessage("hello world", "fallback")).toBe("hello world");
    const long = "a".repeat(200);
    const title = titleFromMessage(long, "fallback");
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(81);
  });

  it("summarizeOutputStyle uses the first sentence and respects maxLength", () => {
    expect(summarizeOutputStyle("Markdown sections. With bullets.")).toBe("Markdown sections");
    expect(summarizeOutputStyle("Plain prose only", 10)).toBe("Plain pro…");
    expect(summarizeOutputStyle("")).toBe("");
  });
});
