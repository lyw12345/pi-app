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
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-stream-"));
  testTmpCwd = tmpCwd;
  delete (globalThis as Record<string, unknown>).__piTerminalAllowedRootsCache;
  delete (globalThis as Record<string, unknown>).__piTerminalStreamAllowedRootsCache;
});

describe("GET /api/terminal/stream/[...cwd]", () => {
  it("sends a replay event with the current buffer", async () => {
    const { getTerminalManager } = await import("@/lib/terminal/manager");
    const mgr = getTerminalManager();
    const s = mgr.getOrCreate(tmpCwd);
    s.buffer.push({ kind: "info", text: "preloaded", ts: 1 });
    s.bufferBytes = 64;

    const { NextRequest } = await import("next/server");
    const req = new NextRequest(`http://localhost/api/terminal/stream/${encodeURIComponent(tmpCwd)}`);
    const { GET } = await import("./route");
    const res = await GET(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ cwd: [tmpCwd] }) } as unknown as { params: Promise<{ cwd: string[] }> });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toMatch(/event: replay|replay/);
    expect(text).toMatch(/preloaded/);

    await reader.cancel();
  });
});
