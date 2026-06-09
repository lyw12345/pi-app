import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetTerminalManagerForTests } from "@/lib/terminal/manager";
import { _resetTerminalSettingsCache } from "@/lib/terminal/settings";
import fs from "fs";
import os from "os";
import path from "path";

// Stub requireApiAuth so the test doesn't depend on the request being
// authenticated. The /state route's real auth is exercised by integration
// tests in CI; here we focus on the cwd resolution + manager plumbing.
vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: () => null,
}));

let tmpCwd: string;

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-state-"));
});

describe("GET /api/terminal/[cwd]/state", () => {
  it("returns 200 with empty buffer for a fresh cwd", async () => {
    const { NextRequest } = await import("next/server");
    const { GET } = await import("./route");
    const req = new NextRequest(`http://localhost/api/terminal/${encodeURIComponent(tmpCwd)}/state`);
    const res = await GET(req as any, { params: Promise.resolve({ cwd: [tmpCwd] }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buffer).toEqual([]);
    expect(body.history).toEqual([]);
    expect(body.running).toBeNull();
  });
});
