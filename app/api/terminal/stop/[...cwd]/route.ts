// app/api/terminal/stop/[...cwd]/route.ts
//
// POST — explicitly kill the current keep-running process. Returns 404
// when there is no active process, or when the active process is a
// non-keep-running command (those are time-bounded; explicit stop is
// not exposed for them in v1).

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
  var __piTerminalStopAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piTerminalStopAllowedRootsCache;
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
  globalThis.__piTerminalStopAllowedRootsCache = { roots, expiresAt: now + 5_000 };
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

  const mgr = getTerminalManager();
  const session = mgr.getOrCreate(cwd);
  const rp = session.runningProcess;
  if (!rp) {
    return NextResponse.json({ error: "no_active_process" }, { status: 404 });
  }
  if (!rp.isKeepRunning) {
    return NextResponse.json({ error: "no_active_process" }, { status: 404 });
  }
  const killedPid = rp.pid;
  mgr.stop(session, "user");
  return NextResponse.json({ killed: killedPid });
}
