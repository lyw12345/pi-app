import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test fixtures shared between the module mocks and the test bodies.
const roots = vi.hoisted(() => ({
  agentDir: "",
  homedir: "",
  // Skill names the next runNpx call should create under ~/.pi/agent/skills.
  nextSkillsToCreate: [] as string[],
  // If set, runNpx returns this output instead of "Installation complete".
  nextOutput: null as string | null,
  // If set, runNpx throws (simulating install failure).
  nextError: null as unknown,
}));

// Mock the upstream install command. We don't run real `npx`; the mock
// simulates the upstream CLI by writing skill files into the mocked homedir
// (so the route's "snapshot then diff" mirror logic has a real diff to act on).
vi.mock("@/lib/npx", () => ({
  runNpx: vi.fn(async () => {
    if (roots.nextError !== null) {
      const err = roots.nextError;
      roots.nextError = null;
      throw err;
    }
    const upstream = join(roots.homedir, ".pi", "agent", "skills");
    mkdirSync(upstream, { recursive: true });
    for (const name of roots.nextSkillsToCreate) {
      const dir = join(upstream, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), `mocked: ${name}`);
    }
    roots.nextSkillsToCreate = [];
    return {
      stdout: roots.nextOutput ?? "Installation complete\n",
      stderr: "",
    };
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
    roots.nextSkillsToCreate = [];
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

    // Configure the mocked npx to create exactly one new skill under upstream.
    roots.nextSkillsToCreate = ["new-skill"];

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

  it("reinstalling an existing skill replaces its directory contents", async () => {
    const { POST } = await import("./route");

    // Pre-seed dev with a stale copy of the skill.
    const devDir = join(roots.agentDir, "skills", "shared-skill");
    mkdirSync(devDir, { recursive: true });
    writeFileSync(join(devDir, "SKILL.md"), "old-dev");
    writeFileSync(join(devDir, "stale.txt"), "to-be-cleaned");

    // The mock will create the upstream copy under a different name so the
    // "before" snapshot doesn't include it (so it's "new" for the diff).
    roots.nextSkillsToCreate = ["shared-skill"];

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

    const dest = join(roots.agentDir, "skills", "shared-skill", "SKILL.md");
    expect(readFileSync(dest, "utf8")).toBe("mocked: shared-skill");
    // The old `stale.txt` should be gone — we wiped the dest before copying.
    expect(existsSync(join(roots.agentDir, "skills", "shared-skill", "stale.txt"))).toBe(false);
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

  it("mirrorNewGlobalSkills only copies entries that didn't exist in the before-snapshot", async () => {
    const { mirrorNewGlobalSkills, listDirs } = await import("@/lib/skill-mirror");
    const upstream = makeTempDir("mirror-up-");
    const target = makeTempDir("mirror-tgt-");

    mkdirSync(join(upstream, "old-skill"), { recursive: true });
    writeFileSync(join(upstream, "old-skill", "SKILL.md"), "old");
    mkdirSync(join(upstream, "new-skill"), { recursive: true });
    writeFileSync(join(upstream, "new-skill", "SKILL.md"), "new");

    const before = new Set(["old-skill"]);
    const mirrored = await mirrorNewGlobalSkills(upstream, target, before);
    expect(mirrored).toEqual(["new-skill"]);

    const targetDirs = await listDirs(target);
    expect(targetDirs).toEqual(["new-skill"]);
    expect(readFileSync(join(target, "new-skill", "SKILL.md"), "utf8")).toBe("new");
  });
});
