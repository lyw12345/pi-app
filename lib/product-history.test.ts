import { describe, expect, it } from "vitest";
import { buildHistoryItems, deriveProjectName, PROJECT_NAME_FALLBACK } from "./product-history";
import type { SessionInfo } from "./types";
import type { ProductSessionMetadataMap } from "./scene-metadata";

const baseSession = (overrides: Partial<SessionInfo>): SessionInfo => ({
  path: "/tmp/s.jsonl",
  id: "s1",
  cwd: "/work",
  created: "2026-06-01T08:00:00.000Z",
  modified: "2026-06-01T09:00:00.000Z",
  messageCount: 2,
  firstMessage: "Hello",
  ...overrides,
});

describe("buildHistoryItems", () => {
  it("prefers product metadata title and summary over session fields", () => {
    const sessions = [baseSession({ id: "s1", name: "Session name", firstMessage: "Hello" })];
    const metadata: ProductSessionMetadataMap = {
      s1: {
        title: "Custom title",
        status: "completed",
        lastResultSummary: "Done",
        startedAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T11:00:00.000Z",
      },
    };

    const [item] = buildHistoryItems(sessions, metadata);
    expect(item.title).toBe("Custom title");
    expect(item.summary).toBe("Done");
    expect(item.status).toBe("completed");
    expect(item.startedAt).toBe("2026-06-01T10:00:00.000Z");
    expect(item.updatedAt).toBe("2026-06-01T11:00:00.000Z");
  });

  it("falls back to session name, first message, and active status", () => {
    const sessions = [
      baseSession({
        id: "a",
        name: "Named",
        firstMessage: "First line",
        created: "2026-06-01T08:00:00.000Z",
        modified: "2026-06-01T08:05:00.000Z",
      }),
      baseSession({
        id: "b",
        firstMessage: "",
        created: "2026-06-01T09:00:00.000Z",
        modified: "2026-06-01T09:10:00.000Z",
      }),
    ];

    const byId = Object.fromEntries(buildHistoryItems(sessions, {}).map((i) => [i.sessionId, i]));
    expect(byId.a.title).toBe("Named");
    expect(byId.a.summary).toBe("First line");
    expect(byId.a.status).toBe("active");
    expect(byId.b.title).toBe("(untitled)");
    expect(byId.b.summary).toBe("");
  });

  it("sorts by updatedAt descending", () => {
    const sessions = [
      baseSession({ id: "old", modified: "2026-06-01T08:00:00.000Z" }),
      baseSession({ id: "new", modified: "2026-06-01T12:00:00.000Z" }),
    ];

    const items = buildHistoryItems(sessions, {});
    expect(items.map((i) => i.sessionId)).toEqual(["new", "old"]);
  });
});

describe("deriveProjectName", () => {
  it("returns the basename of an absolute path", () => {
    expect(deriveProjectName("/work/pi-app")).toBe("pi-app");
    expect(deriveProjectName("/Users/mk/codespace/pi-agent")).toBe("pi-agent");
  });

  it("trims trailing slashes and falls back when only root is provided", () => {
    expect(deriveProjectName("/work/pi-app/")).toBe("pi-app");
    expect(deriveProjectName("/")).toBe(PROJECT_NAME_FALLBACK);
    expect(deriveProjectName(".")).toBe(PROJECT_NAME_FALLBACK);
  });

  it("falls back when cwd is empty or nullish", () => {
    expect(deriveProjectName("")).toBe(PROJECT_NAME_FALLBACK);
    expect(deriveProjectName("   ")).toBe(PROJECT_NAME_FALLBACK);
    expect(deriveProjectName(null)).toBe(PROJECT_NAME_FALLBACK);
    expect(deriveProjectName(undefined)).toBe(PROJECT_NAME_FALLBACK);
  });
});

describe("buildHistoryItems projectName", () => {
  it("exposes a projectName field derived from cwd", () => {
    const sessions = [
      baseSession({ id: "a", cwd: "/work/pi-app" }),
      baseSession({ id: "b", cwd: "/Users/me/agent" }),
    ];
    const items = buildHistoryItems(sessions, {});
    const byId = Object.fromEntries(items.map((i) => [i.sessionId, i]));
    expect(byId.a.projectName).toBe("pi-app");
    expect(byId.b.projectName).toBe("agent");
  });

  it("uses the fallback when cwd is missing", () => {
    const sessions = [baseSession({ id: "x", cwd: "" })];
    const [item] = buildHistoryItems(sessions, {});
    expect(item.projectName).toBe(PROJECT_NAME_FALLBACK);
  });
});
