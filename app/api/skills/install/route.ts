import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { NextResponse } from "next/server";
import { runNpx } from "@/lib/npx";
import { rejectUnsafeMutation } from "@/lib/local-request-guard";
import { getAgentDir, usesIsolatedAgentDataDir } from "@/lib/agent-dir";
import { listDirs, mirrorNewGlobalSkills } from "@/lib/skill-mirror";

export const dynamic = "force-dynamic";

const ANSI_RE = /\x1B\[[0-9;]*m/g;

// POST /api/skills/install  body: { package: string; scope: "global" | "project"; cwd?: string }
export async function POST(req: Request) {
  const rejected = rejectUnsafeMutation(req);
  if (rejected) return rejected;

  try {
    const { package: pkg, scope, cwd } = await req.json() as { package?: string; scope?: string; cwd?: string };
    if (!pkg?.trim()) return NextResponse.json({ error: "package required" }, { status: 400 });

    const isGlobal = scope !== "project";
    const args = ["skills", "add", pkg.trim(), "-y", "--agent", "pi"];
    if (isGlobal) args.push("-g");

    // Snapshot the upstream global skills dir before the install so we can
    // detect what was added and mirror it into the dev's data dir if needed.
    // The upstream CLI hardcodes global skills to ~/.pi/agent/skills, see
    // skills CLI: agents.pi.globalSkillsDir = join(home, ".pi/agent/skills").
    const upstreamGlobalSkillsDir = join(homedir(), ".pi", "agent", "skills");
    const before = isGlobal ? new Set(await listDirs(upstreamGlobalSkillsDir)) : new Set<string>();
    // Ensure the dir exists so the upstream CLI can write into it on first install.
    if (isGlobal && !existsSync(upstreamGlobalSkillsDir)) {
      await mkdir(upstreamGlobalSkillsDir, { recursive: true });
    }

    console.log(`[skills/install] running: npx ${args.join(" ")}`);
    const { stdout, stderr } = await runNpx(args, {
      timeout: 60000,
      cwd: !isGlobal && cwd ? cwd : undefined,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const output = (stdout + stderr).replace(ANSI_RE, "");
    const success = /Installation complete|Installed \d+ skill/.test(output);
    if (!success) {
      return NextResponse.json({ error: output.slice(-300) || "Install failed" }, { status: 500 });
    }

    // Mirror the new skill(s) into the dev agent dir if it differs from the
    // upstream default. On prod these paths are identical, so this is a no-op.
    let mirrored: string[] = [];
    if (isGlobal && usesIsolatedAgentDataDir()) {
      const targetDir = join(getAgentDir(), "skills");
      await mkdir(targetDir, { recursive: true });
      mirrored = await mirrorNewGlobalSkills(upstreamGlobalSkillsDir, targetDir, before);
      if (mirrored.length > 0) {
        console.log(`[skills/install] mirrored global skills into ${targetDir}: ${mirrored.join(", ")}`);
      }
    }

    return NextResponse.json({ success: true, output, mirrored });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = ((err.stdout ?? "") + (err.stderr ?? "")).replace(ANSI_RE, "");
    return NextResponse.json({ error: output || (err.message ?? String(e)) }, { status: 500 });
  }
}
