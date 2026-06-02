import { describe, it, expect } from "vitest";
import { suggestNextStep } from "./next-step-suggestion";
import type { Scene } from "./scenes";

function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "test-scene",
    name: "Test Scene",
    description: "Test scene.",
    category: "Test",
    entryMode: "chat",
    defaultPrompt: "",
    sourceIds: [],
    actionIds: [],
    outputStyle: "",
    suggestedStarters: [],
    status: "active",
    ...overrides,
  };
}

const LONG_TEXT = "x".repeat(2_000);
const MEDIUM_TEXT =
  "This assistant output is long enough to clear the sixty-character minimum so the rule engine actually runs.";

describe("suggestNextStep", () => {
  it("returns null when latestText is empty", () => {
    const scene = makeScene();
    expect(suggestNextStep("", scene, null)).toBeNull();
  });

  it("returns null when latestText is shorter than 60 chars", () => {
    const scene = makeScene();
    expect(suggestNextStep("short", scene, null)).toBeNull();
  });

  it("returns the summarize action when latestText is long and the scene has one", () => {
    const scene = makeScene({ actionIds: ["summarize", "copy-result"] });
    const result = suggestNextStep(LONG_TEXT, scene, null);
    expect(result).not.toBeNull();
    expect(result?.id).toBe("summarize");
  });

  it("returns null when latestText is long but the scene has no summarize action", () => {
    const scene = makeScene({ actionIds: ["copy-result", "export-result"] });
    expect(suggestNextStep(LONG_TEXT, scene, null)).toBeNull();
  });

  it("returns the export-result action when lastActionId is refine-output", () => {
    const scene = makeScene({ actionIds: ["refine-output", "export-result"] });
    const result = suggestNextStep(MEDIUM_TEXT, scene, "refine-output");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("export-result");
  });

  it("returns null when lastActionId is refine-output but the scene has no export-result", () => {
    const scene = makeScene({ actionIds: ["refine-output"] });
    expect(suggestNextStep(MEDIUM_TEXT, scene, "refine-output")).toBeNull();
  });

  it("returns the followup action for customer-communication with a question mark", () => {
    const scene = makeScene({
      id: "customer-communication",
      actionIds: ["followup", "copy-result"],
    });
    const result = suggestNextStep(
      "Could you clarify the return policy for damaged items in this account?",
      scene,
      null,
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe("followup");
  });

  it("returns null for customer-communication with no question or exclamations", () => {
    const scene = makeScene({ id: "customer-communication", actionIds: ["followup"] });
    expect(
      suggestNextStep("Plain product description without punctuation marks here", scene, null),
    ).toBeNull();
  });

  it("falls back to draft-reply when followup is absent for customer-communication", () => {
    const scene = makeScene({ id: "customer-communication", actionIds: ["draft-reply"] });
    const result = suggestNextStep(
      "Could you help me resolve this question about the damaged shipment for this account?",
      scene,
      null,
    );
    expect(result?.id).toBe("draft-reply");
  });

  it("returns the followup action when customer text has at least two exclamation marks", () => {
    const scene = makeScene({ id: "customer-communication", actionIds: ["followup"] });
    const result = suggestNextStep(
      "Please help ASAP!! The customer is waiting on a response about their damaged order.",
      scene,
      null,
    );
    expect(result?.id).toBe("followup");
  });

  it("ignores an unrelated lastActionId when the refine rule does not apply", () => {
    const scene = makeScene({ actionIds: ["copy-result", "export-result"] });
    expect(suggestNextStep(MEDIUM_TEXT, scene, "copy-result")).toBeNull();
  });

  it("prioritizes the long-text rule over the refine→export rule", () => {
    const scene = makeScene({
      actionIds: ["summarize", "refine-output", "export-result"],
    });
    const result = suggestNextStep(LONG_TEXT, scene, "refine-output");
    expect(result?.id).toBe("summarize");
  });
});
