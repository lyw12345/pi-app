import { PRESET_DEFAULT, PRESET_FULL, PRESET_NONE, type ToolPreset } from "@/components/ToolPanel";
import type { ToolMode } from "@/lib/pi-web-preferences";

export interface SimpleCapability {
  id: string;
  labelKey: string;
}

export const SIMPLE_CAPABILITIES: SimpleCapability[] = [
  { id: "read", labelKey: "tools.capability.readFiles" },
  { id: "write", labelKey: "tools.capability.editFiles" },
  { id: "grep", labelKey: "tools.capability.searchFiles" },
];

export function toolModeToPreset(mode: ToolMode): ToolPreset {
  if (mode === "full") return "full";
  if (mode === "default") return "default";
  return "default";
}

export function toolModeToToolNames(mode: ToolMode): string[] {
  if (mode === "full") return PRESET_FULL;
  if (mode === "default") return PRESET_DEFAULT;
  if (mode === "simple") return PRESET_DEFAULT;
  return PRESET_NONE;
}

export function presetToToolMode(preset: ToolPreset, currentMode: ToolMode): ToolMode {
  if (preset === "full") return "full";
  if (preset === "none") return currentMode === "simple" ? "simple" : "default";
  return currentMode === "simple" ? "simple" : "default";
}
