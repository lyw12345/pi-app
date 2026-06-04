import { describe, expect, it } from "vitest";
import { mergeSceneWithOverride } from "./scenes";
import { sanitizeSceneOverrideFields } from "./scene-overrides";
import { buildScenePack, previewScenePackImport, validateScenePack } from "./scene-pack";

describe("scene-overrides", () => {
  it("sanitizes override fields", () => {
    const value = sanitizeSceneOverrideFields({
      outputStyle: "  concise  ",
      suggestedStarters: [" hello ", "world"],
    });
    expect(value.outputStyle).toBe("concise");
    expect(value.suggestedStarters).toEqual(["hello", "world"]);
  });
});

describe("scene-pack", () => {
  it("validates schema version", () => {
    const result = validateScenePack({ schemaVersion: 2, scenes: {} });
    expect(result.ok).toBe(false);
  });

  it("previews create and update changes", () => {
    const pack = buildScenePack({
      "report-generation": { outputStyle: "New style" },
    });
    const preview = previewScenePackImport({}, pack);
    expect(preview.unknownSceneIds).toEqual([]);
    expect(preview.changes).toEqual([
      { sceneId: "report-generation", action: "create", fields: ["outputStyle"] },
    ]);
  });

  it("merges scene with override", () => {
    const scene = mergeSceneWithOverride(
      {
        id: "report-generation",
        title: "Report",
        description: "d",
        defaultPrompt: "base",
        outputStyle: "base style",
        suggestedStarters: ["a"],
      },
      { outputStyle: "override style" },
    );
    expect(scene.outputStyle).toBe("override style");
    expect(scene.defaultPrompt).toBe("base");
  });
});
