import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadPiWebPreferences,
  MAX_RECENT_WORKSPACE_CWDS,
  mergePiWebPreferences,
  rememberWorkspaceCwd,
  savePiWebPreferences,
} from "./pi-web-preferences";

describe("pi-web-preferences", () => {
  it("loads empty preferences when file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-web-prefs-"));
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      expect(loadPiWebPreferences()).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  });

  it("persists merged preferences atomically", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-web-prefs-"));
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      savePiWebPreferences({ toolMode: "simple" });
      const merged = mergePiWebPreferences({
        defaultWorkspaceCwd: "/tmp/workspace",
        notificationsEnabled: true,
      });
      expect(merged.toolMode).toBe("simple");
      expect(merged.defaultWorkspaceCwd).toBe("/tmp/workspace");
      const raw = JSON.parse(readFileSync(join(dir, "pi-web-preferences.json"), "utf8")) as {
        defaultWorkspaceCwd?: string;
      };
      expect(raw.defaultWorkspaceCwd).toBe("/tmp/workspace");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  });

  it("records opened workspaces most-recent-first, de-duplicated and capped", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-web-prefs-"));
    const prev = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    try {
      rememberWorkspaceCwd("/work/a");
      rememberWorkspaceCwd("/work/b");
      rememberWorkspaceCwd("/work/a");
      expect(loadPiWebPreferences().recentWorkspaceCwds).toEqual(["/work/a", "/work/b"]);

      for (let i = 0; i < MAX_RECENT_WORKSPACE_CWDS + 5; i += 1) {
        rememberWorkspaceCwd(`/work/dir-${i}`);
      }
      const recent = loadPiWebPreferences().recentWorkspaceCwds ?? [];
      expect(recent).toHaveLength(MAX_RECENT_WORKSPACE_CWDS);
      expect(recent[0]).toBe(`/work/dir-${MAX_RECENT_WORKSPACE_CWDS + 4}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prev;
    }
  });
});
