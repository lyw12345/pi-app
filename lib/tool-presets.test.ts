import { describe, expect, it } from "vitest";
import { PRESET_DEFAULT, PRESET_FULL } from "@/components/ToolPanel";
import { toolModeToPreset, toolModeToToolNames } from "./tool-presets";

describe("tool-presets", () => {
  it("maps simple mode to default preset tools", () => {
    expect(toolModeToPreset("simple")).toBe("default");
    expect(toolModeToToolNames("simple")).toEqual(PRESET_DEFAULT);
  });

  it("maps full mode to full preset tools", () => {
    expect(toolModeToPreset("full")).toBe("full");
    expect(toolModeToToolNames("full")).toEqual(PRESET_FULL);
  });
});
