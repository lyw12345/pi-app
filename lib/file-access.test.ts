import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canReadFilePath,
  filePathFromSegments,
  isPathAllowed,
  isRealPathAllowed,
  parseByteRange,
} from "./file-access";

describe("file access helpers", () => {
  const tmpDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reconstructs POSIX absolute paths from route segments", () => {
    expect(filePathFromSegments(["Users", "mk", "project", "README.md"])).toBe("/Users/mk/project/README.md");
  });

  it("preserves Windows absolute paths encoded as route segments", () => {
    expect(filePathFromSegments(["C:", "Users", "mk", "project", "file.txt"])).toBe("C:/Users/mk/project/file.txt");
  });

  it("allows exact roots and descendants but rejects sibling prefix tricks", () => {
    const roots = new Set(["/Users/mk/project"]);

    expect(isPathAllowed("/Users/mk/project", roots)).toBe(true);
    expect(isPathAllowed("/Users/mk/project/src/app.ts", roots)).toBe(true);
    expect(isPathAllowed("/Users/mk/project-evasive/secret.txt", roots)).toBe(false);
  });

  it("rejects arbitrary existing files outside allowed roots", () => {
    const allowedRoot = makeTempDir("pi-allowed-");
    const outsideRoot = makeTempDir("pi-outside-");
    const allowedFile = join(allowedRoot, "notes.txt");
    const outsideFile = join(outsideRoot, "secret.txt");
    writeFileSync(allowedFile, "ok");
    writeFileSync(outsideFile, "secret");

    expect(canReadFilePath(allowedFile, new Set([allowedRoot]))).toBe(true);
    expect(canReadFilePath(outsideFile, new Set([allowedRoot]))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("rejects symlinks that resolve outside allowed roots", () => {
    const allowedRoot = makeTempDir("pi-allowed-");
    const outsideRoot = makeTempDir("pi-outside-");
    const outsideFile = join(outsideRoot, "secret.txt");
    const symlinkPath = join(allowedRoot, "linked-secret.txt");
    writeFileSync(outsideFile, "secret");
    symlinkSync(outsideFile, symlinkPath);

    expect(isPathAllowed(symlinkPath, new Set([allowedRoot]))).toBe(true);
    expect(isRealPathAllowed(symlinkPath, new Set([allowedRoot]))).toBe(false);
    expect(canReadFilePath(symlinkPath, new Set([allowedRoot]))).toBe(false);
  });

  it("parses regular and suffix byte ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
    expect(parseByteRange("bytes=90-999", 100)).toEqual({ start: 90, end: 99 });
  });

  it("reports invalid or unsatisfiable byte ranges", () => {
    expect(parseByteRange("items=1-2", 100)).toEqual({ error: "invalid" });
    expect(parseByteRange("bytes=-", 100)).toEqual({ error: "invalid" });
    expect(parseByteRange("bytes=50-40", 100)).toEqual({ error: "unsatisfiable" });
    expect(parseByteRange("bytes=100-120", 100)).toEqual({ error: "unsatisfiable" });
  });
});
