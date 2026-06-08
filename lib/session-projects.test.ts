import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { getPickerCwds, getProjectCwds, isSystemTempCwd } from "./session-projects";

describe("getProjectCwds", () => {
  it("returns every project cwd sorted by latest activity", () => {
    const sessions = Array.from({ length: 7 }, (_, index) => ({
      cwd: `/project-${index + 1}`,
      modified: `2026-06-05T10:0${index}:00.000Z`,
    }));

    expect(getProjectCwds(sessions)).toEqual([
      "/project-7",
      "/project-6",
      "/project-5",
      "/project-4",
      "/project-3",
      "/project-2",
      "/project-1",
    ]);
  });

  it("uses the newest session when multiple sessions share a cwd", () => {
    expect(getProjectCwds([
      { cwd: "/older", modified: "2026-06-05T10:00:00.000Z" },
      { cwd: "/shared", modified: "2026-06-05T09:00:00.000Z" },
      { cwd: "/shared", modified: "2026-06-05T11:00:00.000Z" },
    ])).toEqual(["/shared", "/older"]);
  });
});

describe("isSystemTempCwd", () => {
  const tmp = tmpdir();

  it("returns true for the OS temp dir itself", () => {
    expect(isSystemTempCwd(tmp)).toBe(true);
  });

  it("returns true for a subdir of the OS temp dir", () => {
    expect(isSystemTempCwd(join(tmp, "pi-runtime-events-12345-abc"))).toBe(true);
    expect(isSystemTempCwd(join(tmp, "nested", "deeper", "cwd"))).toBe(true);
  });

  it("returns false for real user projects", () => {
    expect(isSystemTempCwd("/Users/mk/codespace/pi-web")).toBe(false);
    expect(isSystemTempCwd("/Users/mk/pi-cwd-20260603")).toBe(false);
  });

  it("returns false for an empty cwd", () => {
    expect(isSystemTempCwd("")).toBe(false);
  });

  it("does not match paths that merely contain the temp dir name", () => {
    const outside = `${sep}home${sep}user${sep}my-tmp${sep}project`;
    expect(isSystemTempCwd(outside)).toBe(false);
  });
});

describe("getPickerCwds", () => {
  const tmp = tmpdir();

  it("filters out sessions whose cwd is inside the OS temp dir", () => {
    const cwds = getPickerCwds([
      { cwd: "/Users/mk/codespace/pi-web", modified: "2026-06-05T12:00:00.000Z" },
      { cwd: join(tmp, "pi-runtime-events-1780878-abcd"), modified: "2026-06-08T08:00:00.000Z" },
      { cwd: join(tmp, "pi-2860-1780878-efgh"), modified: "2026-06-08T07:55:00.000Z" },
      { cwd: "/Users/mk/codespace/pi", modified: "2026-06-05T11:00:00.000Z" },
    ]);

    expect(cwds).toEqual([
      "/Users/mk/codespace/pi-web",
      "/Users/mk/codespace/pi",
    ]);
  });

  it("preserves the most-recent-first sort from getProjectCwds", () => {
    const cwds = getPickerCwds([
      { cwd: "/Users/mk/codespace/old", modified: "2026-06-01T00:00:00.000Z" },
      { cwd: join(tmp, "ignored"), modified: "2026-06-08T00:00:00.000Z" },
      { cwd: "/Users/mk/codespace/new", modified: "2026-06-07T00:00:00.000Z" },
    ]);
    expect(cwds).toEqual(["/Users/mk/codespace/new", "/Users/mk/codespace/old"]);
  });
});
