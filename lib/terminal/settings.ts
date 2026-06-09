// lib/terminal/settings.ts
//
// Reads the `terminal.*` block from $PI_CODING_AGENT_DIR/settings.json.
// Falls back to sensible defaults when keys are missing. Throws on
// invalid values (negative numbers, non-numeric strings) — fail loud.

import fs from "fs";
import path from "path";
import { getAgentDir } from "@/lib/agent-dir";

export type TerminalSettings = {
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  historyLimit: number;
};

const DEFAULTS: TerminalSettings = {
  defaultTimeoutMs: 300_000,   // 5 min
  maxOutputBytes: 1_048_576,   // 1 MB
  historyLimit: 50,
};

type RawTerminalBlock = Partial<{
  defaultTimeoutMs: unknown;
  maxOutputBytes: unknown;
  historyLimit: unknown;
}>;

function readRawBlock(): RawTerminalBlock {
  const file = path.join(getAgentDir(), "settings.json");
  if (!fs.existsSync(file)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const block = (parsed as { terminal?: unknown }).terminal;
  if (typeof block !== "object" || block === null) return {};
  return block as RawTerminalBlock;
}

function validateNumber(value: unknown, key: keyof TerminalSettings): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Invalid settings.json terminal.${key}: expected non-negative finite number, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

let cached: TerminalSettings | null = null;

/** Read and validate the terminal settings. Cached after first read. */
export function getTerminalSettings(): TerminalSettings {
  if (cached) return cached;
  const block = readRawBlock();
  const settings: TerminalSettings = {
    defaultTimeoutMs:
      block.defaultTimeoutMs !== undefined
        ? validateNumber(block.defaultTimeoutMs, "defaultTimeoutMs")
        : DEFAULTS.defaultTimeoutMs,
    maxOutputBytes:
      block.maxOutputBytes !== undefined
        ? validateNumber(block.maxOutputBytes, "maxOutputBytes")
        : DEFAULTS.maxOutputBytes,
    historyLimit:
      block.historyLimit !== undefined
        ? validateNumber(block.historyLimit, "historyLimit")
        : DEFAULTS.historyLimit,
  };
  cached = settings;
  return settings;
}

/** Test-only: clear the in-memory cache so the next read re-parses settings.json. */
export function _resetTerminalSettingsCache(): void {
  cached = null;
}
