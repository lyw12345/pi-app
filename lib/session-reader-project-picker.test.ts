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

vi.mock("@/lib/pi-web-preferences", () => ({
  loadPiWebPreferences: () => ({}),
}));

describe("listProjectCwdsForPicker", () => {
  beforeEach(() => {
    listAllMock.mockReset();
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
});
