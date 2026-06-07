import { copyFile, mkdir, readdir, readlink, rm, stat as lstat } from "fs/promises";
import { join, resolve } from "path";

/**
 * The upstream `npx skills add -g --agent pi` always writes global skills to
 * `~/.pi/agent/skills/` (see agents.pi.globalSkillsDir in skills-cli/cli.mjs —
 * hardcoded, no env override). On prod the data dir IS that path, so the install
 * lands where the UI reads from. On dev (PI_CODING_AGENT_DIR=~/tmp/pi-dev-agent)
 * the UI reads from a different directory and would never see the new skill.
 *
 * `mirrorGlobalSkill()` handles the dev-side half: take whatever the upstream
 * CLI just dropped into `~/.pi/agent/skills/<name>/` and copy it into the
 * dev's data dir (`${getAgentDir()}/skills/<name>/`).
 */

/** List immediate child directory names inside `dir`. Returns [] if `dir` doesn't exist. */
export async function listDirs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Recursively copy `src` directory to `dest`, dereferencing symlinks so the
 * copy stands alone (no broken links pointing back to `src`). Symlinks are
 * resolved and the target is copied as a regular file / dir.
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await copyFile(s, d);
    } else if (entry.isSymbolicLink()) {
      // Best-effort: follow the symlink and copy the target. Skipping
      // (without copying) would also be reasonable, but a real file is more
      // useful — and matches what the upstream CLI itself does (it
      // clean-and-creates a real directory at the install target).
      try {
        const target = await readlink(s);
        const abs = resolve(s, "..", target);
        const st = await lstat(abs);
        if (st.isFile()) await copyFile(abs, d);
        else if (st.isDirectory()) await copyDir(abs, d);
      } catch {
        // best effort
      }
    }
  }
}

/**
 * Extract installed skill names from the upstream CLI's stdout/stderr output.
 *
 * The CLI's "Installed N skill" block prints one of:
 *   `✓ <skillName> (copied)`        — files were copied to the agent dir
 *   `✓ <shortPath>`                 — symlink created at the agent dir
 *   `✓ <skillName> ← <pkg>`         — `skills update` summary line
 *
 * We match the `\u2713 <name>` pattern after stripping ANSI codes. Names are
 * validated against a conservative character set so the mirror only ever
 * receives values that could be filesystem directory names. The `copied`
 * qualifier is *not* required (symlink-only installs are also valid).
 */
export function parseInstalledSkillNames(output: string): string[] {
  // The upstream output is already ANSI-stripped by the route, but the call
  // is defensive: if not, strip here too.
  const clean = output.replace(/\x1B\[[0-9;]*m/g, "");
  const names: string[] = [];
  const seen = new Set<string>();
  // `\u2713` is the check mark character used by the CLI.
  for (const line of clean.split(/\r?\n/)) {
    const match = line.match(/\u2713\s+(\S+)/);
    if (!match) continue;
    const raw = match[1];
    // Strip a trailing `(copied)` qualifier or arrow-source decoration.
    let name = raw.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*←.*$/, "").trim();
    // Symlink-only installs print the destination path instead of the name.
    // Take the basename in that case so downstream always sees a skill name.
    // Reject any path component that tries to traverse (`..`) before taking
    // the basename — the parser is the only barrier between upstream output
    // and a `join(targetDir, name)` filesystem call, so be conservative.
    if (name.includes("/")) {
      const parts = name.split("/").filter(Boolean);
      if (parts.some((p) => p === "..")) continue;
      name = parts.pop() ?? "";
    }
    // Reject anything that doesn't look like a real skill name.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Copy the named skill directories from `upstreamSkillsDir` into
 * `targetSkillsDir`. Each target directory is wiped first so reinstalls
 * pick up the new content (matches upstream's own clean-and-create
 * behaviour on reinstall). Names that don't exist upstream are skipped
 * silently (defensive — parseInstalledSkillNames might surface a
 * line that doesn't correspond to a real skill).
 */
export async function mirrorNamedGlobalSkills(
  upstreamSkillsDir: string,
  targetSkillsDir: string,
  names: string[],
): Promise<string[]> {
  const mirrored: string[] = [];
  for (const name of names) {
    const src = join(upstreamSkillsDir, name);
    const dest = join(targetSkillsDir, name);
    try {
      const srcStat = await lstat(src).catch(() => null);
      if (!srcStat) continue; // not present upstream — skip
      if ((await lstat(dest).catch(() => null)) !== null) {
        await rm(dest, { recursive: true, force: true });
      }
      await copyDir(src, dest);
      mirrored.push(name);
    } catch (e) {
      console.error(`[skill-mirror] failed to mirror ${name}:`, e);
    }
  }
  return mirrored;
}
