// app/api/terminal/stream/[...cwd]/route.ts
//
// GET — SSE stream. First emits a `replay` event with the current buffer,
// then live `line` and `state` events. Closing the connection does NOT
// kill the running process; the next connect re-receives the replay.

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal/manager";
import type { TerminalEvent } from "@/lib/terminal/types";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";
import { listAllSessions } from "@/lib/session-reader";
import { getAgentDir } from "@/lib/agent-dir";
import os from "os";
import path from "path";
import fs from "fs";

declare global {
  var __piTerminalStreamAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piTerminalStreamAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;
  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) if (s.cwd) roots.add(s.cwd);
  roots.add(getAgentDir());
  try {
    for (const name of fs.readdirSync(os.homedir())) {
      if (/^pi-cwd-\d{8}$/.test(name)) roots.add(path.join(os.homedir(), name));
    }
  } catch {}
  roots.add(os.homedir());
  globalThis.__piTerminalStreamAllowedRootsCache = { roots, expiresAt: now + 5_000 };
  return roots;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ cwd: string[] }> },
) {
  const rejected = requireApiAuth(request);
  if (rejected) return rejected;

  const { cwd: segments } = await ctx.params;
  const cwd = filePathFromSegments(segments);
  const allowed = await getAllowedRoots();
  if (!isPathAllowed(cwd, allowed)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mgr = getTerminalManager();
  const session = mgr.getOrCreate(cwd);

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: TerminalEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected mid-write
        }
      };

      // 1) Send the replay immediately.
      send({ type: "replay", lines: session.buffer });
      send({ type: "state", running: session.runningProcess ? {
        pid: session.runningProcess.pid,
        command: session.runningProcess.command,
        startedAt: session.runningProcess.startedAt,
        isKeepRunning: session.runningProcess.isKeepRunning,
      } : null });

      // 2) Subscribe to live events.
      unsubscribe = mgr.subscribe(session, send);

      // 3) Heartbeat every 15s to keep proxies from idling out the connection.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {}
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
