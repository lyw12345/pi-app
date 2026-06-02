import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  existsSyncMock,
  startRpcSessionMock,
  rejectMock,
  getSceneByIdWithOverrideMock,
  readSceneOverrideMock,
  buildSceneLaunchMessageMock,
  titleFromMessageMock,
  upsertProductSessionMetadataMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  startRpcSessionMock: vi.fn(),
  rejectMock: vi.fn(),
  getSceneByIdWithOverrideMock: vi.fn(),
  readSceneOverrideMock: vi.fn(),
  buildSceneLaunchMessageMock: vi.fn(),
  titleFromMessageMock: vi.fn(),
  upsertProductSessionMetadataMock: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("@/lib/rpc-manager", () => ({
  startRpcSession: startRpcSessionMock,
}));

vi.mock("@/lib/local-request-guard", () => ({
  rejectUnsafeMutation: rejectMock,
}));

vi.mock("@/lib/scenes", () => ({
  getSceneByIdWithOverride: getSceneByIdWithOverrideMock,
  buildSceneLaunchMessage: buildSceneLaunchMessageMock,
  titleFromMessage: titleFromMessageMock,
}));

vi.mock("@/lib/scene-overrides", () => ({
  readSceneOverride: readSceneOverrideMock,
}));

vi.mock("@/lib/scene-metadata", () => ({
  upsertProductSessionMetadata: upsertProductSessionMetadataMock,
}));

function buildRequest(body: unknown): Request {
  return new Request("http://localhost:30141/api/scenes/enterprise-knowledge/launch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

const scene = {
  id: "enterprise-knowledge",
  name: "Enterprise Knowledge Assistant",
};

describe("POST /api/scenes/[id]/launch", () => {
  beforeEach(() => {
    globalThis.__piSceneLaunchLocks = undefined;
  });

  afterEach(() => {
    globalThis.__piSceneLaunchLocks = undefined;
  });

  it("creates a scene-aware session and persists product metadata", async () => {
    const sendMock = vi.fn().mockResolvedValue({ ok: true });

    rejectMock.mockReset().mockReturnValueOnce(null);
    getSceneByIdWithOverrideMock.mockReset().mockReturnValueOnce(scene);
    readSceneOverrideMock.mockReset().mockReturnValueOnce(null);
    existsSyncMock.mockReset().mockReturnValueOnce(true);
    buildSceneLaunchMessageMock.mockReset().mockReturnValueOnce("wrapped launch prompt");
    titleFromMessageMock.mockReset().mockReturnValueOnce("What changed in policy?");
    startRpcSessionMock.mockReset().mockResolvedValueOnce({
      session: { send: sendMock },
      realSessionId: "session-123",
    });
    upsertProductSessionMetadataMock.mockReset().mockResolvedValueOnce(undefined);

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        cwd: "/workspace/demo",
        message: "What changed in policy?",
        provider: "openai",
        modelId: "gpt-5",
        toolNames: ["Skill", "Read"],
        thinkingLevel: "high",
      }),
      { params: buildParams("enterprise-knowledge") },
    );
    const body = (await res.json()) as { sessionId?: string; sceneId?: string; success?: boolean };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      sessionId: "session-123",
      sceneId: "enterprise-knowledge",
    });
    expect(startRpcSessionMock).toHaveBeenCalledWith(
      expect.stringMatching(/^__scene__enterprise-knowledge__/),
      "",
      "/workspace/demo",
      ["Skill", "Read"],
    );
    expect(sendMock).toHaveBeenNthCalledWith(1, {
      type: "set_model",
      provider: "openai",
      modelId: "gpt-5",
    });
    expect(sendMock).toHaveBeenNthCalledWith(2, {
      type: "set_thinking_level",
      level: "high",
    });
    expect(sendMock).toHaveBeenNthCalledWith(3, {
      type: "prompt",
      message: "wrapped launch prompt",
    });
    expect(buildSceneLaunchMessageMock).toHaveBeenCalledWith(scene, "What changed in policy?");
    expect(upsertProductSessionMetadataMock).toHaveBeenCalledWith(
      "session-123",
      expect.objectContaining({
        sceneId: "enterprise-knowledge",
        title: "What changed in policy?",
        status: "active",
        lastResultSummary: "What changed in policy?",
      }),
    );
  });

  it("returns 404 when the scene is unknown", async () => {
    rejectMock.mockReset().mockReturnValueOnce(null);
    getSceneByIdWithOverrideMock.mockReset().mockReturnValueOnce(null);
    readSceneOverrideMock.mockReset().mockReturnValueOnce(null);
    startRpcSessionMock.mockReset();

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ cwd: "/workspace/demo", message: "hello" }),
      { params: buildParams("missing-scene") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/scene not found/i);
    expect(startRpcSessionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the working directory is missing on disk", async () => {
    rejectMock.mockReset().mockReturnValueOnce(null);
    getSceneByIdWithOverrideMock.mockReset().mockReturnValueOnce(scene);
    readSceneOverrideMock.mockReset().mockReturnValueOnce(null);
    existsSyncMock.mockReset().mockReturnValueOnce(false);
    startRpcSessionMock.mockReset();

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ cwd: "/workspace/missing", message: "hello" }),
      { params: buildParams("enterprise-knowledge") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain("Directory does not exist");
    expect(startRpcSessionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the launch message is missing", async () => {
    rejectMock.mockReset().mockReturnValueOnce(null);
    getSceneByIdWithOverrideMock.mockReset().mockReturnValueOnce(scene);
    readSceneOverrideMock.mockReset().mockReturnValueOnce(null);
    existsSyncMock.mockReset().mockReturnValueOnce(true);
    startRpcSessionMock.mockReset();

    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ cwd: "/workspace/demo", message: "   " }),
      { params: buildParams("enterprise-knowledge") },
    );
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/message is required/i);
    expect(startRpcSessionMock).not.toHaveBeenCalled();
  });
});
