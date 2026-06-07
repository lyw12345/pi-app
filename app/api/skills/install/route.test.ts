import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test fixtures shared between the module mocks and the test bodies.
const roots = vi.hoisted(() => ({
  agentDir: "",
  homedir: "",
  // Output the next runNpx call should return. If `nextSkills` is non-empty,
  // the mock also creates those skill directories under ~/.pi/agent/skills
  // before returning, mirroring the real upstream CLI's side effects.
  nextSkills: [] as string[],
  nextOutput: null as string | null,
  nextError: null as unknown,
}));

// Mock the upstream install command. We don't run real `npx`; the mock
// simulates the upstream CLI by writing skill files into the mocked homedir
// AND returning the corresponding "Installed N skill" output that the route
// parses to find the installed skill names.
vi.mock("@/lib/npx", () => ({
  runNpx: vi.fn(async () => {
    if (roots.nextError !== null) {
      const err = roots.nextError;
      roots.nextError = null;
      throw err;
    }
    if (roots.nextOutput !== null) {
      const out = roots.nextOutput;
      roots.nextOutput = null;
      return { stdout: out, stderr: "" };
    }
    const upstream = join(roots.homedir, ".pi", "agent", "skills");
    mkdirSync(upstream, { recursive: true });
    const installedLines: string[] = [];
    for (const name of roots.nextSkills) {
      const dir = join(upstream, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), `mocked: ${name}`);
      installedLines.push(`  \u2713 ${name} (copied)`);
    }
    roots.nextSkills = [];
    const count = installedLines.length;
    const summary = `Installation complete\nInstalled ${count} skill${count !== 1 ? "s" : ""}\n${installedLines.join("\n")}\n`;
    return { stdout: summary, stderr: "" };
  }),
}));

// Mock getAgentDir / usesIsolatedAgentDataDir so we can simulate the dev case
// (agentDir differs from ~/.pi/agent) without touching the host filesystem.
vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => roots.agentDir,
  usesIsolatedAgentDataDir: () => true,
}));

// Force homedir() to a tmp dir so the test never touches the real user home.
vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => roots.homedir };
});

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe("/api/skills/install — global install mirrors into dev agent dir", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    roots.homedir = makeTempDir("pi-skills-install-home-");
    roots.agentDir = makeTempDir("pi-skills-install-agent-");
    roots.nextSkills = [];
    roots.nextOutput = null;
    roots.nextError = null;
    // Pre-create the upstream global skills dir, empty.
    mkdirSync(join(roots.homedir, ".pi", "agent", "skills"), { recursive: true });
    tmpDirs.push(roots.homedir, roots.agentDir);
  });

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    vi.clearAllMocks();
  });

  it("after a global install, copies the newly added skill into the dev agent dir", async () => {
    const { POST } = await import("./route");

    roots.nextSkills = ["new-skill"];

    const req = new Request("http://127.0.0.1:30142/api/skills/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:30142",
        origin: "http://127.0.0.1:30142",
      },
      body: JSON.stringify({ package: "owner/new-skill", scope: "global" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; mirrored: string[] };
    expect(data.success).toBe(true);
    expect(data.mirrored).toEqual(["new-skill"]);

    const dest = join(roots.agentDir, "skills", "new-skill", "SKILL.md");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe("mocked: new-skill");
  });

  it("reinstalling a skill overwrites the dev's copy with the new upstream version", async () => {
    const { POST } = await import("./route");

    // Pre-seed dev with a stale copy of the skill.
    const devDir = join(roots.agentDir, "skills", "shared-skill");
    mkdirSync(devDir, { recursive: true });
    writeFileSync(join(devDir, "SKILL.md"), "old-dev");
    writeFileSync(join(devDir, "stale.txt"), "to-be-cleaned");

    // Mock will install `shared-skill` again, triggering the mirror.
    roots.nextSkills = ["shared-skill"];

    const req = new Request("http://127.0.0.1:30142/api/skills/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:30142",
        origin: "http://127.0.0.1:30142",
      },
      body: JSON.stringify({ package: "owner/shared-skill", scope: "global" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // The new upstream content should have replaced the dev's stale copy.
    const dest = join(roots.agentDir, "skills", "shared-skill", "SKILL.md");
    expect(readFileSync(dest, "utf8")).toBe("mocked: shared-skill");
    // Old `stale.txt` should be gone — we wiped the dest before copying.
    expect(existsSync(join(roots.agentDir, "skills", "shared-skill", "stale.txt"))).toBe(false);
  });

  it("mirrors a skill installed via prod into dev (upstream has it, dev doesn't)", async () => {
    const { POST } = await import("./route");

    // Pre-seed upstream as if a prior install on prod already created this
    // skill there. The mock now sees the same skill name in `nextSkills` and
    // refreshes upstream + emits the ✓ line, so the route will mirror it.
    roots.nextSkills = ["prod-only-skill"];

    const req = new Request("http://127.0.0.1:30142/api/skills/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:30142",
        origin: "http://127.0.0.1:30142",
      },
      body: JSON.stringify({ package: "owner/prod-only-skill", scope: "global" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; mirrored: string[] };
    expect(data.success).toBe(true);
    expect(data.mirrored).toEqual(["prod-only-skill"]);

    const dest = join(roots.agentDir, "skills", "prod-only-skill", "SKILL.md");
    expect(readFileSync(dest, "utf8")).toBe("mocked: prod-only-skill");
  });

  it("does NOT touch a skill the user has on dev but is missing upstream", async () => {
    const { POST } = await import("./route");

    // Dev has a skill that upstream doesn't — possibly the user dropped a
    // custom SKILL.md into their dev data dir. The mock adds a different
    // skill, so the route should leave the dev-only one alone.
    const devDir = join(roots.agentDir, "skills", "dev-only-skill");
    mkdirSync(devDir, { recursive: true });
    writeFileSync(join(devDir, "SKILL.md"), "user-custom");

    roots.nextSkills = ["some-other-skill"];

    const req = new Request("http://127.0.0.1:30142/api/skills/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:30142",
        origin: "http://127.0.0.1:30142",
      },
      body: JSON.stringify({ package: "owner/some-other-skill", scope: "global" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; mirrored: string[] };
    expect(data.mirrored).toEqual(["some-other-skill"]);

    // Dev-only skill must still be there untouched.
    expect(existsSync(join(devDir, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(devDir, "SKILL.md"), "utf8")).toBe("user-custom");
  });

  it("returns 500 when the install command reports failure", async () => {
    const { POST } = await import("./route");
    roots.nextOutput = "Some install error\n";
    const req = new Request("http://127.0.0.1:30142/api/skills/install", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:30142",
        origin: "http://127.0.0.1:30142",
      },
      body: JSON.stringify({ package: "owner/bad", scope: "global" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Some install error");
  });
});

describe("skill-mirror helpers", () => {
  const tmpDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const d = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  beforeEach(() => {
    tmpDirs.length = 0;
  });

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("copyDir copies a directory tree with nested files", async () => {
    const { copyDir } = await import("@/lib/skill-mirror");
    const src = makeTempDir("copydir-src-");
    const dest = makeTempDir("copydir-dest-");

    mkdirSync(join(src, "a", "b"), { recursive: true });
    writeFileSync(join(src, "a", "b", "leaf.txt"), "leaf-content");
    writeFileSync(join(src, "a", "top.txt"), "top-content");

    await copyDir(src, dest);

    expect(readFileSync(join(dest, "a", "b", "leaf.txt"), "utf8")).toBe("leaf-content");
    expect(readFileSync(join(dest, "a", "top.txt"), "utf8")).toBe("top-content");
  });

  it("copyDir resolves symlinks (no broken links in the destination)", async () => {
    const { copyDir } = await import("@/lib/skill-mirror");
    const src = makeTempDir("copydir-symlink-src-");
    const dest = makeTempDir("copydir-symlink-dest-");

    const target = join(src, "target.txt");
    writeFileSync(target, "linked-content");
    symlinkSync(target, join(src, "link.txt"));

    await copyDir(src, dest);

    expect(existsSync(join(dest, "link.txt"))).toBe(true);
    expect(readFileSync(join(dest, "link.txt"), "utf8")).toBe("linked-content");
  });

  it("listDirs returns only directory names, swallowing missing dir errors", async () => {
    const { listDirs } = await import("@/lib/skill-mirror");
    const dir = makeTempDir("copydir-list-");
    mkdirSync(join(dir, "alpha"), { recursive: true });
    writeFileSync(join(dir, "loose.txt"), "x");

    const dirs = await listDirs(dir);
    expect(dirs).toEqual(["alpha"]);

    const missing = await listDirs(join(dir, "nope"));
    expect(missing).toEqual([]);
  });

  describe("parseInstalledSkillNames", () => {
    it("extracts names from the standard ✓ name (copied) line", async () => {
      const { parseInstalledSkillNames } = await import("@/lib/skill-mirror");
      const out = `Installation complete\nInstalled 2 skills\n  \u2713 foo-skill (copied)\n  \u2713 bar-skill (copied)\n`;
      expect(parseInstalledSkillNames(out)).toEqual(["foo-skill", "bar-skill"]);
    });

    it("handles the symlink-only ✓ shortPath variant", async () => {
      const { parseInstalledSkillNames } = await import("@/lib/skill-mirror");
      const out = `Installation complete\nInstalled 1 skill\n  \u2713 /Users/me/.pi/agent/skills/foo-skill\n`;
      // Path-like input is normalised to the basename so the mirror only
      // ever sees a valid skill name.
      expect(parseInstalledSkillNames(out)).toEqual(["foo-skill"]);
    });

    it("ignores lines without a check mark and rejects garbage names", async () => {
      const { parseInstalledSkillNames } = await import("@/lib/skill-mirror");
      const out = `random noise\nnot installed: stuff\n  \u2713 valid-name (copied)\n  \u2713 ../escape\n  \u2713 bad$name\n`;
      expect(parseInstalledSkillNames(out)).toEqual(["valid-name"]);
    });

    it("deduplicates the same name appearing on multiple lines", async () => {
      const { parseInstalledSkillNames } = await import("@/lib/skill-mirror");
      const out = `  \u2713 foo (copied)\n  \u2713 foo ← pkg\n  \u2713 bar (copied)\n`;
      expect(parseInstalledSkillNames(out)).toEqual(["foo", "bar"]);
    });

    it("returns [] when the output has no install summary", async () => {
      const { parseInstalledSkillNames } = await import("@/lib/skill-mirror");
      expect(parseInstalledSkillNames("")).toEqual([]);
      expect(parseInstalledSkillNames("Some error occurred\n")).toEqual([]);
    });
  });

  describe("mirrorNamedGlobalSkills", () => {
    it("copies only the named skills, leaves others untouched", async () => {
      const { mirrorNamedGlobalSkills } = await import("@/lib/skill-mirror");
      const upstream = makeTempDir("named-up-");
      const target = makeTempDir("named-tgt-");

      mkdirSync(join(upstream, "wanted-skill"), { recursive: true });
      writeFileSync(join(upstream, "wanted-skill", "SKILL.md"), "wanted");
      mkdirSync(join(upstream, "unwanted-skill"), { recursive: true });
      writeFileSync(join(upstream, "unwanted-skill", "SKILL.md"), "unwanted");

      // Pre-populate target with the unwanted one — we want to make sure it
      // stays the way the user left it.
      mkdirSync(join(target, "unwanted-skill"), { recursive: true });
      writeFileSync(join(target, "unwanted-skill", "SKILL.md"), "user-edited");

      const mirrored = await mirrorNamedGlobalSkills(upstream, target, ["wanted-skill"]);
      expect(mirrored).toEqual(["wanted-skill"]);

      expect(readFileSync(join(target, "wanted-skill", "SKILL.md"), "utf8")).toBe("wanted");
      // Unwanted skill was NOT touched (still has the user's old content).
      expect(readFileSync(join(target, "unwanted-skill", "SKILL.md"), "utf8")).toBe(
        "user-edited",
      );
    });

    it("skips names that don't exist upstream (defensive)", async () => {
      const { mirrorNamedGlobalSkills } = await import("@/lib/skill-mirror");
      const upstream = makeTempDir("named-up-empty-");
      const target = makeTempDir("named-tgt-empty-");

      const mirrored = await mirrorNamedGlobalSkills(upstream, target, ["ghost-skill"]);
      expect(mirrored).toEqual([]);
    });
  });
});
