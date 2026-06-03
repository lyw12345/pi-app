import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const agentDir = vi.hoisted(() => ({ value: "" }));

vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => agentDir.value,
}));

const STORE_FILE = "scene-overrides.json";

describe("scene-overrides", () => {
  beforeEach(() => {
    agentDir.value = mkdtempSync(join(tmpdir(), "pi-overrides-"));
  });

  afterEach(() => {
    rmSync(agentDir.value, { recursive: true, force: true });
  });

  it("returns an empty map when the store file is missing", async () => {
    const { readAllSceneOverrides } = await import("./scene-overrides");
    expect(readAllSceneOverrides()).toEqual({});
  });

  it("returns an empty map when the stored JSON is corrupt", async () => {
    writeFileSync(join(agentDir.value, STORE_FILE), "{not json", "utf8");
    const { readAllSceneOverrides } = await import("./scene-overrides");
    expect(readAllSceneOverrides()).toEqual({});
  });

  it("parses a valid overrides file", async () => {
    writeFileSync(
      join(agentDir.value, STORE_FILE),
      JSON.stringify({
        schemaVersion: 1,
        scenes: { "report-generation": { outputStyle: "Markdown" } },
      }),
      "utf8",
    );
    const { readAllSceneOverrides, readSceneOverride } = await import("./scene-overrides");
    expect(readAllSceneOverrides()).toEqual({
      "report-generation": { outputStyle: "Markdown" },
    });
    expect(readSceneOverride("report-generation")).toEqual({ outputStyle: "Markdown" });
    expect(readSceneOverride("missing")).toBeNull();
  });

  it("creates a new entry when none exists", async () => {
    const { upsertSceneOverride } = await import("./scene-overrides");
    const merged = await upsertSceneOverride("report-generation", { outputStyle: "Markdown" });
    expect(merged).toEqual({ outputStyle: "Markdown" });
    const raw = JSON.parse(readFileSync(join(agentDir.value, STORE_FILE), "utf8"));
    expect(raw.schemaVersion).toBe(1);
    expect(raw.scenes["report-generation"]).toEqual({ outputStyle: "Markdown" });
  });

  it("merges into an existing entry", async () => {
    writeFileSync(
      join(agentDir.value, STORE_FILE),
      JSON.stringify({
        schemaVersion: 1,
        scenes: { "report-generation": { outputStyle: "Markdown" } },
      }),
      "utf8",
    );
    const { upsertSceneOverride } = await import("./scene-overrides");
    const merged = await upsertSceneOverride("report-generation", {
      suggestedStarters: ["Compile this week"],
    });
    expect(merged).toEqual({
      outputStyle: "Markdown",
      suggestedStarters: ["Compile this week"],
    });
  });

  it("writes atomically (no .tmp files left behind)", async () => {
    const { upsertSceneOverride } = await import("./scene-overrides");
    await upsertSceneOverride("a", { outputStyle: "A" });
    await upsertSceneOverride("b", { outputStyle: "B" });
    const { readdirSync } = await import("fs");
    const entries = readdirSync(agentDir.value);
    const stray = entries.filter((entry) => entry.endsWith(".tmp"));
    expect(stray).toEqual([]);
  });

  it("serializes concurrent upserts so both writes survive", async () => {
    const { upsertSceneOverride, readAllSceneOverrides } = await import("./scene-overrides");
    await Promise.all([
      upsertSceneOverride("a", { outputStyle: "A" }),
      upsertSceneOverride("b", { outputStyle: "B" }),
      upsertSceneOverride("c", { outputStyle: "C" }),
    ]);
    const map = readAllSceneOverrides();
    expect(map).toEqual({
      a: { outputStyle: "A" },
      b: { outputStyle: "B" },
      c: { outputStyle: "C" },
    });
  });

  it("clearSceneOverride returns false when nothing was removed", async () => {
    const { clearSceneOverride } = await import("./scene-overrides");
    expect(await clearSceneOverride("unknown")).toBe(false);
  });

  it("clearSceneOverride returns true and removes the entry", async () => {
    const { upsertSceneOverride, clearSceneOverride, readSceneOverride } = await import(
      "./scene-overrides"
    );
    await upsertSceneOverride("report-generation", { outputStyle: "Markdown" });
    expect(await clearSceneOverride("report-generation")).toBe(true);
    expect(readSceneOverride("report-generation")).toBeNull();
  });
});
