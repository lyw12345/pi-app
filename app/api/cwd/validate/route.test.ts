import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPiWebPreferences } from "@/lib/pi-web-preferences";

vi.mock("@/lib/local-request-guard", () => ({
  rejectUnsafeMutation: () => null,
}));

function postCwd(cwd: string): Request {
  return new Request("http://127.0.0.1:30142/api/cwd/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cwd }),
  });
}

describe("POST /api/cwd/validate", () => {
  const tmpDirs: string[] = [];
  let prevAgentDir: string | undefined;

  beforeEach(() => {
    prevAgentDir = process.env.PI_CODING_AGENT_DIR;
    const agentDir = mkdtempSync(join(tmpdir(), "pi-validate-agent-"));
    tmpDirs.push(agentDir);
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  afterEach(() => {
    if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    globalThis.__piAllowedRootsCache = undefined;
    vi.clearAllMocks();
  });

  it("records a validated workspace and invalidates the allowed-roots cache", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pi-validate-ws-"));
    tmpDirs.push(workspace);
    globalThis.__piAllowedRootsCache = { roots: new Set(["/stale"]), expiresAt: Date.now() + 10_000 };

    const { POST } = await import("./route");
    const res = await POST(postCwd(workspace));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, cwd: workspace });
    expect(loadPiWebPreferences().recentWorkspaceCwds).toContain(workspace);
    expect(globalThis.__piAllowedRootsCache).toBeUndefined();
  });

  it("rejects a path that does not exist", async () => {
    const { POST } = await import("./route");
    const res = await POST(postCwd(join(tmpdir(), "pi-validate-missing-zzz")));

    expect(res.status).toBe(400);
  });
});
