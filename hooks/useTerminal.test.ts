// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTerminal } from "./useTerminal";
import { resetTerminalManagerForTests, getTerminalManager } from "@/lib/terminal/manager";
import { _resetTerminalSettingsCache } from "@/lib/terminal/settings";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) { this.url = url; MockEventSource.instances.push(this); }
  close() { this.readyState = 2; }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

beforeEach(() => {
  resetTerminalManagerForTests();
  _resetTerminalSettingsCache();
  MockEventSource.instances = [];
  (globalThis as Record<string, unknown>).EventSource = MockEventSource;
  globalThis.fetch = vi.fn(async (url: string) => {
    if (typeof url !== "string") return new Response("not found", { status: 404 });
    if (url.includes("/state/")) {
      const session = getTerminalManager().getOrCreate("/tmp/proj-hook");
      return new Response(JSON.stringify({ prompt: "mk@host proj %", buffer: session.buffer, history: [], running: null }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).EventSource;
  vi.restoreAllMocks();
});

describe("useTerminal", () => {
  it("does not connect when enabled is false", () => {
    renderHook(() => useTerminal("/tmp/proj-hook", false));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("opens EventSource + fetches state when enabled flips to true", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBe(1);
    });
    const fetchCalls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(fetchCalls.some((u: string) => u.includes("/state/"))).toBe(true);
    expect(result.current.running).toBeNull();
    await waitFor(() => expect(result.current.prompt).toBe("mk@host proj %"));
    expect(result.current.lines).toEqual([]);
  });

  it("appends lines from SSE events", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit({ type: "line", line: { kind: "info", text: "hello", ts: 1 } });
    });
    await waitFor(() => {
      expect(result.current.lines.length).toBe(1);
    });
    expect(result.current.lines[0].kind).toBe("info");
  });

  it("replaces lines from a replay event", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit({ type: "replay", lines: [
        { kind: "info", text: "old1", ts: 1 },
        { kind: "info", text: "old2", ts: 2 },
      ] });
    });
    await waitFor(() => {
      expect(result.current.lines.length).toBe(2);
    });
    expect((result.current.lines[1] as { text: string }).text).toBe("old2");
  });

  it("updates running when a state event arrives", async () => {
    const { result } = renderHook(() => useTerminal("/tmp/proj-hook", true));
    await waitFor(() => expect(MockEventSource.instances.length).toBe(1));
    const es = MockEventSource.instances[0];
    act(() => {
      es.emit({ type: "state", running: { pid: 12345, command: "x", startedAt: 1, isKeepRunning: true } });
    });
    await waitFor(() => {
      expect(result.current.running?.pid).toBe(12345);
    });
  });
});
