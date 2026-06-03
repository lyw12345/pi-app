import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok for loopback requests", async () => {
    const req = new Request("http://127.0.0.1:30141/api/health", {
      headers: { host: "127.0.0.1:30141" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok?: boolean; version?: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  it("rejects non-loopback requests", async () => {
    const req = new Request("http://example.com/api/health", {
      headers: { host: "example.com" },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
