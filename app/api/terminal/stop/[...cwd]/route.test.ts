import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetTerminalManagerForTests, getTerminalManager } from "@/lib/terminal/manager";
import { _resetTerminalSettingsCache } from "@/lib/terminal/settings";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: () => null,
}));

let testTmpCwd = "/";
vi.mock("@/lib/session-reader", () => ({
  listAllSessions: async () => [{ cwd: testTmpCwd } as { cwd: string } & Record<string, unknown>],
}));

let tmpCwd: string;

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-stop-"));
  testTmpCwd = tmpCwd;
  delete (globalThis as Record<string, unknown>).__piTerminalAllowedRootsCache;
  delete (globalThis as Record<string, unknown>).__piTerminalStopAllowedRootsCache;
});

describe("POST /api/terminal/stop/[...cwd]", () => {
  it("returns 404 when there is no running process", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    getTerminalManager().getOrCreate(tmpCwd);
    const req = new NextRequest(`http://localhost/api/terminal/stop/${encodeURIComponent(tmpCwd)}`, { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res.status).toBe(404);
  });

  it("returns 404 when only a non-keep-running process is active", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const session = getTerminalManager().getOrCreate(tmpCwd);
    await getTerminalManager().startCommand(session, "sleep 1", false);
    const req = new NextRequest(`http://localhost/api/terminal/stop/${encodeURIComponent(tmpCwd)}`, { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res.status).toBe(404);
    try { session.runningProcess?.child.kill("SIGKILL"); } catch { /* ignore */ }
  });

  it("returns 200 with killed pid and clears the running process for keep-running", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const session = getTerminalManager().getOrCreate(tmpCwd);
    await getTerminalManager().startCommand(session, "sleep 5", true);
    const req = new NextRequest(`http://localhost/api/terminal/stop/${encodeURIComponent(tmpCwd)}`, { method: "POST" });
    const res = await POST(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.killed).toBeTypeOf("number");
    await new Promise((r) => setTimeout(r, 500));
    expect(session.runningProcess).toBeNull();
  });
});
