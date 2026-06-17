import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PI_WEB_PREFERENCES_FILENAME } from "@/lib/pi-web-preferences";

const roots = vi.hoisted(() => ({
  sessionCwd: "",
  agentDir: "",
}));

vi.mock("@/lib/session-reader", () => ({
  listAllSessions: vi.fn(async () => [{ cwd: roots.sessionCwd }]),
}));

vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => roots.agentDir,
}));

function pathSegments(filePath: string): string[] {
  return filePath.replace(/^\/+/, "").split("/");
}

function requestFor(filePath: string, type = "read"): NextRequest {
  return new NextRequest(`http://127.0.0.1:30142/api/files/${encodeURIComponent(filePath)}?type=${type}`, {
    headers: {
      host: "127.0.0.1:30142",
      origin: "http://127.0.0.1:30142",
    },
  });
}

describe("GET /api/files/[...path]", () => {
  const tmpDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    roots.sessionCwd = makeTempDir("pi-files-cwd-");
    roots.agentDir = makeTempDir("pi-files-agent-");
    globalThis.__piAllowedRootsCache = undefined;
  });

  afterEach(() => {
    globalThis.__piAllowedRootsCache = undefined;
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it("reads files inside an allowed session cwd", async () => {
    const { GET } = await import("./route");
    const filePath = join(roots.sessionCwd, "notes.txt");
    writeFileSync(filePath, "visible");

    const res = await GET(requestFor(filePath), {
      params: Promise.resolve({ path: pathSegments(filePath) }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ content: "visible", language: "text" });
  });

  it("allows the configured default workspace before it has any saved session", async () => {
    const workspace = makeTempDir("pi-files-default-ws-");
    writeFileSync(
      join(roots.agentDir, PI_WEB_PREFERENCES_FILENAME),
      JSON.stringify({ defaultWorkspaceCwd: workspace }),
    );

    const { GET } = await import("./route");
    const filePath = join(workspace, "readme.md");
    writeFileSync(filePath, "hello");

    const res = await GET(requestFor(filePath), {
      params: Promise.resolve({ path: pathSegments(filePath) }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ content: "hello" });
  });

  it("allows a recently opened workspace before it has any saved session", async () => {
    const workspace = makeTempDir("pi-files-recent-ws-");
    writeFileSync(
      join(roots.agentDir, PI_WEB_PREFERENCES_FILENAME),
      JSON.stringify({ recentWorkspaceCwds: [workspace] }),
    );

    const { GET } = await import("./route");
    const filePath = join(workspace, "note.md");
    writeFileSync(filePath, "recent");

    const res = await GET(requestFor(filePath), {
      params: Promise.resolve({ path: pathSegments(filePath) }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ content: "recent" });
  });

  it("rejects existing files outside allowed roots", async () => {
    const { GET } = await import("./route");
    const outsideRoot = makeTempDir("pi-files-outside-");
    const filePath = join(outsideRoot, "secret.txt");
    writeFileSync(filePath, "secret");

    const res = await GET(requestFor(filePath), {
      params: Promise.resolve({ path: pathSegments(filePath) }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Access denied" });
  });

  it("rejects watch requests outside allowed roots", async () => {
    const { GET } = await import("./route");
    const outsideRoot = makeTempDir("pi-files-outside-");
    const filePath = join(outsideRoot, "secret.txt");
    writeFileSync(filePath, "secret");

    const res = await GET(requestFor(filePath, "watch"), {
      params: Promise.resolve({ path: pathSegments(filePath) }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Access denied" });
  });

  it.skipIf(process.platform === "win32")("rejects symlinks that point outside allowed roots", async () => {
    const { GET } = await import("./route");
    const outsideRoot = makeTempDir("pi-files-outside-");
    const outsideFile = join(outsideRoot, "secret.txt");
    const symlinkPath = join(roots.sessionCwd, "linked-secret.txt");
    writeFileSync(outsideFile, "secret");
    symlinkSync(outsideFile, symlinkPath);

    const res = await GET(requestFor(symlinkPath), {
      params: Promise.resolve({ path: pathSegments(symlinkPath) }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Access denied" });
  });
});
