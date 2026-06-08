import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const listAllMock = vi.fn();

vi.mock("@earendil-works/pi-coding-agent", () => ({
  SessionManager: { listAll: listAllMock },
  buildSessionContext: vi.fn(),
}));

vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => "/dev/pi-agent",
  getDefaultAgentDir: () => "/prod/pi-agent",
}));

const prefsMock = vi.fn(() => ({}));
vi.mock("@/lib/pi-web-preferences", () => ({
  loadPiWebPreferences: () => prefsMock(),
}));

describe("listProjectCwdsForPicker", () => {
  beforeEach(() => {
    listAllMock.mockReset();
    prefsMock.mockReset();
    prefsMock.mockReturnValue({});
  });

  it("merges prod session cwds when dev agent dir is isolated", async () => {
    listAllMock.mockImplementation(() => {
      if (process.env.PI_CODING_AGENT_DIR === "/prod/pi-agent") {
        return [
          { cwd: "/Users/mk/codespace/pi", modified: new Date("2026-06-01") },
          { cwd: "/Users/mk/codespace/pi-web", modified: new Date("2026-06-02") },
          { cwd: "/Users/mk/codespace/AmzLT", modified: new Date("2026-06-03") },
        ];
      }
      return [{ cwd: "/Users/mk/codespace/pi", modified: new Date("2026-06-01") }];
    });

    const { listProjectCwdsForPicker } = await import("./session-reader");
    const cwds = await listProjectCwdsForPicker();

    expect(cwds).toContain("/Users/mk/codespace/pi-web");
    expect(cwds).toContain("/Users/mk/codespace/AmzLT");
    expect(listAllMock).toHaveBeenCalledTimes(2);
  });

  it("filters out cwds that sit inside the OS temp directory", async () => {
    const tmp = tmpdir();
    const tempCwdA = join(tmp, "pi-runtime-events-1780878-aaaa");
    const tempCwdB = join(tmp, "pi-2860-1780878-bbbb");
    listAllMock.mockResolvedValue([
      { cwd: "/Users/mk/codespace/pi-web", modified: new Date("2026-06-02") },
      { cwd: tempCwdA, modified: new Date("2026-06-08T08:00:00") },
      { cwd: tempCwdB, modified: new Date("2026-06-08T08:05:00") },
    ]);

    const { listProjectCwdsForPicker } = await import("./session-reader");
    const cwds = await listProjectCwdsForPicker();

    expect(cwds).toEqual(["/Users/mk/codespace/pi-web"]);
    expect(cwds).not.toContain(tempCwdA);
    expect(cwds).not.toContain(tempCwdB);
  });

  it("does not surface a defaultWorkspaceCwd that lives in the OS temp directory", async () => {
    const tmp = tmpdir();
    prefsMock.mockReturnValue({ defaultWorkspaceCwd: join(tmp, "test-runner") });
    listAllMock.mockResolvedValue([
      { cwd: "/Users/mk/codespace/pi-web", modified: new Date("2026-06-02") },
    ]);

    const { listProjectCwdsForPicker } = await import("./session-reader");
    const cwds = await listProjectCwdsForPicker();

    expect(cwds).toEqual(["/Users/mk/codespace/pi-web"]);
  });

  it("preserves a real defaultWorkspaceCwd that is not yet in the session list", async () => {
    prefsMock.mockReturnValue({ defaultWorkspaceCwd: "/Users/mk/pi-cwd-20260603" });
    listAllMock.mockResolvedValue([
      { cwd: "/Users/mk/codespace/pi-web", modified: new Date("2026-06-02") },
    ]);

    const { listProjectCwdsForPicker } = await import("./session-reader");
    const cwds = await listProjectCwdsForPicker();

    expect(cwds).toContain("/Users/mk/pi-cwd-20260603");
    expect(cwds).toContain("/Users/mk/codespace/pi-web");
  });
});
