import { describe, it, expect, vi } from "vitest";

const { readMock, upsertMock, rejectMock } = vi.hoisted(() => ({
  readMock: vi.fn(),
  upsertMock: vi.fn(),
  rejectMock: vi.fn(),
}));

vi.mock("@/lib/scene-metadata", () => ({
  readProductSessionMetadata: readMock,
  upsertProductSessionMetadata: upsertMock,
}));
vi.mock("@/lib/local-request-guard", () => ({
  rejectUnsafeMutation: rejectMock,
}));

const buildRequest = (body: unknown, headers: Record<string, string> = {}): Request => {
  return new Request("http://localhost:30141/api/product-sessions/s1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
};

const buildParams = (id: string): Promise<{ id: string }> => Promise.resolve({ id });

const baseMetadata = {
  sceneId: "enterprise-knowledge",
  title: "Original title",
  status: "active" as const,
  lastResultSummary: "",
  startedAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("PATCH /api/product-sessions/[id]", () => {
  it("returns 200 with merged metadata on a happy-path update", async () => {
    readMock.mockReset().mockReturnValueOnce({ ...baseMetadata });
    upsertMock.mockReset().mockResolvedValueOnce(undefined);
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      buildRequest({ lastResultSummary: "Assistant says hello.", status: "completed" }),
      { params: buildParams("s1") },
    );
    const body = (await res.json()) as { ok?: boolean; metadata?: typeof baseMetadata };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.metadata?.lastResultSummary).toBe("Assistant says hello.");
    expect(body.metadata?.status).toBe("completed");
    expect(body.metadata?.title).toBe("Original title");
    expect(body.metadata?.updatedAt).not.toBe(baseMetadata.updatedAt);
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("returns 400 when the body has no recognized fields", async () => {
    readMock.mockReset();
    upsertMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      buildRequest({ somethingElse: 42 }),
      { params: buildParams("s1") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/lastResultSummary or status/);
    expect(readMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when status is outside the allowed enum", async () => {
    readMock.mockReset();
    upsertMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      buildRequest({ status: "archived" }),
      { params: buildParams("s1") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/status must be one of/);
    expect(readMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the session has no existing metadata row", async () => {
    readMock.mockReset().mockReturnValueOnce(null);
    upsertMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      buildRequest({ status: "completed" }),
      { params: buildParams("missing") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the upsert call throws", async () => {
    readMock.mockReset().mockReturnValueOnce({ ...baseMetadata });
    upsertMock.mockReset().mockRejectedValueOnce(new Error("disk full"));
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PATCH } = await import("./route");
    const res = await PATCH(
      buildRequest({ status: "completed" }),
      { params: buildParams("s1") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Failed to update product session metadata/);
    expect(body.error).toMatch(/disk full/);
  });
});
