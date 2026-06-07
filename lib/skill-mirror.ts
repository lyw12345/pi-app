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
 * Compare `upstreamSkillsDir` before and after to find newly added skill
 * directory names, then copy each into `targetSkillsDir`. Existing entries
 * with the same name are replaced (matches upstream's clean-and-create
 * behaviour on reinstall).
 */
export async function mirrorNewGlobalSkills(
  upstreamSkillsDir: string,
  targetSkillsDir: string,
  before: Set<string>,
): Promise<string[]> {
  const after = await listDirs(upstreamSkillsDir);
  const newEntries = after.filter((name) => !before.has(name));
  const mirrored: string[] = [];
  for (const name of newEntries) {
    const src = join(upstreamSkillsDir, name);
    const dest = join(targetSkillsDir, name);
    try {
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
