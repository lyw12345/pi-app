// app/api/terminal/state/[...cwd]/route.ts
//
// GET — snapshot of the terminal session for a given cwd.
// Returns the current buffer, command history, and running-process summary.

import { NextRequest, NextResponse } from "next/server";
import { getTerminalManager, promptForCwd } from "@/lib/terminal/manager";
import { requireApiAuth } from "@/lib/api-auth";
import { isPathAllowed, filePathFromSegments } from "@/lib/file-access";
import { listAllSessions } from "@/lib/session-reader";
import { getAgentDir } from "@/lib/agent-dir";
import os from "os";
import path from "path";
import fs from "fs";

declare global {
  var __piTerminalAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

const ALLOWED_ROOTS_TTL_MS = 5_000;

async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piTerminalAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;
  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) if (s.cwd) roots.add(s.cwd);
  roots.add(getAgentDir());
  const home = os.homedir();
  try {
    for (const name of fs.readdirSync(home)) {
      if (/^pi-cwd-\d{8}$/.test(name)) roots.add(path.join(home, name));
    }
  } catch {}
  roots.add(home);
  globalThis.__piTerminalAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
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

  const session = getTerminalManager().getOrCreate(cwd);
  return NextResponse.json({
    prompt: promptForCwd(session.currentCwd),
    buffer: session.buffer,
    history: session.history,
    running: session.runningProcess
      ? {
          pid: session.runningProcess.pid,
          command: session.runningProcess.command,
          startedAt: session.runningProcess.startedAt,
          isKeepRunning: session.runningProcess.isKeepRunning,
        }
      : null,
  });
}
