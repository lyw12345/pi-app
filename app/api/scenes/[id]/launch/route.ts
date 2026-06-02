import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { NextResponse } from "next/server";
import { startRpcSession } from "@/lib/rpc-manager";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { buildSceneLaunchMessage, getSceneByIdWithOverride, titleFromMessage } from "@/lib/scenes";
import { readSceneOverride } from "@/lib/scene-overrides";
import { upsertProductSessionMetadata } from "@/lib/scene-metadata";

// Per-scene/per-cwd launch locks to prevent two concurrent launches from
// colliding on the same temporary key inside the RPC registry.
declare global {
  var __piSceneLaunchLocks: Map<string, Promise<unknown>> | undefined;
}

function getLaunchLocks(): Map<string, Promise<unknown>> {
  if (!globalThis.__piSceneLaunchLocks) globalThis.__piSceneLaunchLocks = new Map();
  return globalThis.__piSceneLaunchLocks;
}

function launchLockKey(sceneId: string, cwd: string): string {
  return `${sceneId}::${cwd}`;
}

interface LaunchBody {
  cwd?: string;
  message?: string;
  images?: { type: "image"; data: string; mimeType: string }[];
  provider?: string;
  modelId?: string;
  toolNames?: string[];
  thinkingLevel?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  const { id } = await params;
  const scene = getSceneByIdWithOverride(id, readSceneOverride(id));
  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  try {
    const body = await req.json() as LaunchBody;
    const { cwd, message, images, provider, modelId, toolNames, thinkingLevel } = body;

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Serialize concurrent launches for the same scene + cwd so the temp key
    // we hand to the RPC registry is guaranteed unique even under bursts.
    const lockKey = launchLockKey(scene.id, cwd);
    const locks = getLaunchLocks();
    const previous = locks.get(lockKey);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(lockKey, (previous ?? Promise.resolve()).then(() => gate));

    // Always build a fresh UUID — Date.now() can collide for parallel
    // launches of the same scene within the same millisecond, which would
    // hand two distinct user prompts to the same RPC wrapper.
    const tempKey = `__scene__${scene.id}__${randomUUID()}`;

    try {
      await previous;

      const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, toolNames);

      globalThis.__piAllowedRootsCache?.roots.add(cwd);

      if (provider && modelId) {
        await session.send({ type: "set_model", provider, modelId });
      }
      if (thinkingLevel) {
        await session.send({ type: "set_thinking_level", level: thinkingLevel });
      }

      const launchMessage = buildSceneLaunchMessage(scene, message);
      const result = await session.send({
        type: "prompt",
        message: launchMessage,
        ...(images?.length ? { images } : {}),
      });
      const now = new Date().toISOString();
      await upsertProductSessionMetadata(realSessionId, {
        sceneId: scene.id,
        title: titleFromMessage(message, scene.name),
        status: "active",
        lastResultSummary: message.trim(),
        startedAt: now,
        updatedAt: now,
      });

      return NextResponse.json({
        success: true,
        sessionId: realSessionId,
        sceneId: scene.id,
        data: result,
      });
    } finally {
      release();
      // If no further launches are queued on this lock, drop the entry to
      // prevent the global map from growing without bound.
      if (locks.get(lockKey) === gate) {
        locks.delete(lockKey);
      }
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
