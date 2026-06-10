// app/api/terminal/run/[...cwd]/route.ts
//
// POST — start a new command. The 202 response is sent BEFORE the
// subprocess is known to have spawned successfully; spawn failures
// appear later as a `{kind:"error"}` line in the SSE stream.

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager } from "@/lib/terminal/manager";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";
import { listAllSessions } from "@/lib/session-reader";
import { getAgentDir } from "@/lib/agent-dir";
import os from "os";
import path from "path";
import fs from "fs";

declare global {
  var __piTerminalRunAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piTerminalRunAllowedRootsCache;
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
  globalThis.__piTerminalRunAllowedRootsCache = { roots, expiresAt: now + 5_000 };
  return roots;
}

export async function POST(
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

  let body: { command?: unknown; keepRunning?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request", reason: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.command !== "string" || body.command.trim() === "") {
    return NextResponse.json({ error: "bad_request", reason: "command is required" }, { status: 400 });
  }
  const keepRunning = body.keepRunning === true;

  const mgr = getTerminalManager();
  const session = mgr.getOrCreate(cwd);
  const result = await mgr.startCommand(session, body.command, keepRunning);
  if (!result.ok) {
    return NextResponse.json(
      { error: "command_in_progress", running: session.runningProcess ? {
        pid: session.runningProcess.pid,
        command: session.runningProcess.command,
        startedAt: session.runningProcess.startedAt,
        isKeepRunning: session.runningProcess.isKeepRunning,
      } : null },
      { status: 409 },
    );
  }
  return NextResponse.json({ pid: result.pid, startedAt: result.startedAt }, { status: 202 });
}
