import { describe, it, expect, vi } from "vitest";

const { upsertMock, clearMock, getSceneMock, rejectMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  clearMock: vi.fn(),
  getSceneMock: vi.fn(),
  rejectMock: vi.fn(),
}));

vi.mock("@/lib/scene-overrides", () => ({
  upsertSceneOverride: upsertMock,
  clearSceneOverride: clearMock,
}));
vi.mock("@/lib/scenes", () => ({
  getSceneById: getSceneMock,
}));
vi.mock("@/lib/local-request-guard", () => ({
  rejectUnsafeMutation: rejectMock,
}));

const buildRequest = (method: string, body: unknown): Request =>
  new Request("http://localhost:30141/api/scene-overrides/scene-x", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
  });

const buildParams = (sceneId: string): Promise<{ sceneId: string }> =>
  Promise.resolve({ sceneId });

describe("PUT /api/scene-overrides/[sceneId]", () => {
  it("returns 200 with the merged override on a happy path", async () => {
    getSceneMock.mockReset().mockReturnValueOnce({ id: "scene-x" });
    upsertMock.mockReset().mockResolvedValueOnce({ outputStyle: "Markdown" });
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PUT } = await import("./route");
    const res = await PUT(buildRequest("PUT", { outputStyle: "Markdown" }), {
      params: buildParams("scene-x"),
    });
    const body = (await res.json()) as { override?: { outputStyle?: string } };
    expect(res.status).toBe(200);
    expect(body.override).toEqual({ outputStyle: "Markdown" });
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("returns 400 when the body has no recognized fields", async () => {
    getSceneMock.mockReset().mockReturnValueOnce({ id: "scene-x" });
    upsertMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PUT } = await import("./route");
    const res = await PUT(buildRequest("PUT", { other: 1 }), {
      params: buildParams("scene-x"),
    });
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/at least one of/);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a field exceeds its limit", async () => {
    getSceneMock.mockReset().mockReturnValueOnce({ id: "scene-x" });
    upsertMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PUT } = await import("./route");
    const longStyle = "x".repeat(501);
    const res = await PUT(buildRequest("PUT", { outputStyle: longStyle }), {
      params: buildParams("scene-x"),
    });
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/outputStyle must be at most 500/);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the sceneId is unknown", async () => {
    getSceneMock.mockReset().mockReturnValueOnce(null);
    upsertMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { PUT } = await import("./route");
    const res = await PUT(buildRequest("PUT", { outputStyle: "Markdown" }), {
      params: buildParams("unknown"),
    });
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(404);
    expect(body.error).toMatch(/unknown sceneId/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/scene-overrides/[sceneId]", () => {
  it("returns 200 with cleared=true when an entry was removed", async () => {
    getSceneMock.mockReset().mockReturnValueOnce({ id: "scene-x" });
    clearMock.mockReset().mockResolvedValueOnce(true);
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { DELETE } = await import("./route");
    const res = await DELETE(buildRequest("DELETE", undefined), {
      params: buildParams("scene-x"),
    });
    const body = (await res.json()) as { ok?: boolean; cleared?: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.cleared).toBe(true);
  });

  it("returns 404 when the sceneId is unknown", async () => {
    getSceneMock.mockReset().mockReturnValueOnce(null);
    clearMock.mockReset();
    rejectMock.mockReset().mockReturnValueOnce(null);

    const { DELETE } = await import("./route");
    const res = await DELETE(buildRequest("DELETE", undefined), {
      params: buildParams("unknown"),
    });
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(404);
    expect(body.error).toMatch(/unknown sceneId/i);
    expect(clearMock).not.toHaveBeenCalled();
  });
});
