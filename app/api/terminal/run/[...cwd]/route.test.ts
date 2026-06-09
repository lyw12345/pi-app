import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetTerminalManagerForTests } from "@/lib/terminal/manager";
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
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-run-"));
  testTmpCwd = tmpCwd;
  delete (globalThis as Record<string, unknown>).__piTerminalAllowedRootsCache;
  delete (globalThis as Record<string, unknown>).__piTerminalRunAllowedRootsCache;
});

describe("POST /api/terminal/run/[...cwd]", () => {
  it("returns 400 when body is missing command", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const req = new NextRequest(`http://localhost/api/terminal/run/${encodeURIComponent(tmpCwd)}`, {
      method: "POST",
      body: JSON.stringify({ keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res.status).toBe(400);
  });

  it("returns 202 with pid for a valid command", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const req = new NextRequest(`http://localhost/api/terminal/run/${encodeURIComponent(tmpCwd)}`, {
      method: "POST",
      body: JSON.stringify({ command: "echo hi", keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.pid).toBeTypeOf("number");
    expect(body.startedAt).toBeTypeOf("number");
  });

  it("returns 409 when a non-keep-running command is still active", async () => {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("./route");
    const r1 = new NextRequest(`http://localhost/api/terminal/run/${encodeURIComponent(tmpCwd)}`, {
      method: "POST",
      body: JSON.stringify({ command: "sleep 1", keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res1 = await POST(r1 as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res1.status).toBe(202);
    const r2 = new NextRequest(`http://localhost/api/terminal/run/${encodeURIComponent(tmpCwd)}`, {
      method: "POST",
      body: JSON.stringify({ command: "echo second", keepRunning: false }),
      headers: { "content-type": "application/json" },
    });
    const res2 = await POST(r2 as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res2.status).toBe(409);
    const { getTerminalManager } = await import("@/lib/terminal/manager");
    const session = getTerminalManager().getOrCreate(tmpCwd);
    if (session.runningProcess) {
      try { session.runningProcess.child.kill("SIGKILL"); } catch { /* ignore */ }
    }
  });
});
