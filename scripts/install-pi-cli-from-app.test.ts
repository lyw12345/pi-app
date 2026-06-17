import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHIM_MARKER,
  resolvePiAppCliInstallPath,
  shellShimContents,
} from "./cli-link-common.mjs";
import { installPiCliFromApp } from "./install-pi-cli-from-app.mjs";

describe("installPiCliFromApp", () => {
  const tmpDirs: string[] = [];
  let home = "";
  let piWebRoot = "";
  let nodePath = "";

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "pi-cli-home-"));
    tmpDirs.push(home);
    piWebRoot = mkdtempSync(join(tmpdir(), "pi-cli-web-"));
    tmpDirs.push(piWebRoot);

    mkdirSync(join(piWebRoot, "bin"), { recursive: true });
    writeFileSync(join(piWebRoot, "bin", "pi.js"), "#!/usr/bin/env node\n", "utf8");

    nodePath = join(tmpdir(), `pi-cli-node-${Date.now()}`);
    writeFileSync(nodePath, "#!/bin/sh\necho node\n", "utf8");
    chmodSync(nodePath, 0o755);
    tmpDirs.push(nodePath);

    vi.stubEnv("HOME", home);
    process.env.HOME = home;
    vi.stubEnv("PATH", "/usr/bin:/bin");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const dir of tmpDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("creates ~/.local/bin/pi when no global pi exists", () => {
    const result = installPiCliFromApp({ piWebRoot, nodePath });
    expect(result.ok).toBe(true);
    const linkPath = join(home, ".local", "bin", "pi");
    expect(result.linkPath).toBe(linkPath);
    const content = readFileSync(linkPath, "utf8");
    expect(content).toContain(SHIM_MARKER);
    expect(content).toContain(nodePath);
    expect(content).toContain(join(piWebRoot, "bin", "pi.js"));
  });

  it("updates an existing global pi at the same path", () => {
    const existingDir = join(home, "bin");
    mkdirSync(existingDir, { recursive: true });
    const existingPi = join(existingDir, "pi");
    writeFileSync(existingPi, "#!/bin/sh\necho old-pi\n", "utf8");
    chmodSync(existingPi, 0o755);
    vi.stubEnv("PATH", `${existingDir}:/usr/bin:/bin`);

    const result = installPiCliFromApp({ piWebRoot, nodePath });
    expect(result.ok).toBe(true);
    expect(result.linkPath).toBe(existingPi);
    expect(readFileSync(existingPi, "utf8")).toContain(SHIM_MARKER);
    expect(readFileSync(existingPi, "utf8")).not.toContain("old-pi");
  });
});

describe("shellShimContents", () => {
  it("embeds explicit node and launcher paths", () => {
    const shim = shellShimContents("/Apps/Pi.app/node/bin/node", "/Apps/Pi.app/pi-web/bin/pi.js");
    expect(shim).toContain(SHIM_MARKER);
    expect(shim).toContain('NODE="/Apps/Pi.app/node/bin/node"');
    expect(shim).toContain('LAUNCHER="/Apps/Pi.app/pi-web/bin/pi.js"');
    expect(shim.startsWith("#!/bin/sh")).toBe(true);
  });
});

describe("resolvePiAppCliInstallPath", () => {
  it("prefers an existing pi location on PATH", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-cli-resolve-"));
    const bin = join(home, "custom-bin");
    mkdirSync(bin, { recursive: true });
    const pi = join(bin, "pi");
    writeFileSync(pi, "stub", "utf8");
    chmodSync(pi, 0o755);
    vi.stubEnv("HOME", home);
    vi.stubEnv("PATH", `${bin}:/usr/bin`);
    expect(resolvePiAppCliInstallPath()).toBe(pi);
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });
});
