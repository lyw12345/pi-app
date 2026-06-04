import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
  SessionManager: {},
}));

describe("AgentSessionWrapper", () => {
  it("subscribes to inner events and unsubscribes on destroy", async () => {
    vi.useFakeTimers();
    const { AgentSessionWrapper } = await import("./rpc-manager");
    const unsubscribe = vi.fn();
    let subscribed: ((event: { type: string }) => void) | undefined;
    const inner = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      subscribe: vi.fn((cb) => {
        subscribed = cb;
        return unsubscribe;
      }),
    };

    const wrapper = new AgentSessionWrapper(inner as never);
    const listener = vi.fn();
    wrapper.onEvent(listener);
    wrapper.start();
    subscribed?.({ type: "agent_start" });
    wrapper.destroy();

    expect(listener).toHaveBeenCalledWith({ type: "agent_start" });
    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("sends prompts without awaiting the long-running prompt promise", async () => {
    vi.useFakeTimers();
    const { AgentSessionWrapper } = await import("./rpc-manager");
    const prompt = vi.fn(() => new Promise(() => undefined));
    const inner = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      subscribe: vi.fn(() => vi.fn()),
      prompt,
    };
    const wrapper = new AgentSessionWrapper(inner as never);
    wrapper.start();

    await expect(wrapper.send({ type: "prompt", message: "hello" })).resolves.toBeNull();
    expect(prompt).toHaveBeenCalledWith("hello", undefined);
    wrapper.destroy();
    vi.useRealTimers();
  });

  it("sends get_session_stats through inner session", async () => {
    const { AgentSessionWrapper } = await import("./rpc-manager");
    const stats = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      userMessages: 1,
      assistantMessages: 1,
      toolCalls: 0,
      toolResults: 0,
      totalMessages: 2,
      tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
      cost: 0.001,
    };
    const inner = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      subscribe: vi.fn(() => vi.fn()),
      getSessionStats: vi.fn(() => stats),
    };
    const wrapper = new AgentSessionWrapper(inner as never);
    await expect(wrapper.send({ type: "get_session_stats" })).resolves.toEqual(stats);
  });

  it("exports html via inner exportToHtml", async () => {
    const { AgentSessionWrapper } = await import("./rpc-manager");
    const exportToHtml = vi.fn(async () => "/tmp/session.html");
    const inner = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      subscribe: vi.fn(() => vi.fn()),
      exportToHtml,
    };
    const wrapper = new AgentSessionWrapper(inner as never);
    const result = await wrapper.send({ type: "export_html" }) as { path: string; filename: string };
    expect(result.path).toBe("/tmp/session.html");
    expect(result.filename).toBe("session.html");
    expect(exportToHtml).toHaveBeenCalledOnce();
  });

  it("returns slash commands from inner session sources", async () => {
    const { AgentSessionWrapper } = await import("./rpc-manager");
    const inner = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      subscribe: vi.fn(() => vi.fn()),
      extensionRunner: {
        getRegisteredCommands: () => [{ invocationName: "foo", description: "Foo cmd" }],
      },
      promptTemplates: [{ name: "bar", description: "Bar template" }],
      resourceLoader: {
        getSkills: () => ({ skills: [{ name: "baz", description: "Baz skill" }] }),
      },
    };
    const wrapper = new AgentSessionWrapper(inner as never);
    const result = await wrapper.send({ type: "get_commands" }) as { commands: Array<{ name: string }> };
    expect(result.commands.map((c) => c.name)).toEqual(["foo", "bar", "skill:baz"]);
  });

  it("passes summarize to inner.navigateTree", async () => {
    const navigateTree = vi.fn(async () => ({ cancelled: false }));
    const inner = {
      sessionId: "s1",
      sessionFile: "/tmp/session.jsonl",
      subscribe: vi.fn(() => vi.fn()),
      navigateTree,
    };
    const { AgentSessionWrapper } = await import("./rpc-manager");
    const wrapper = new AgentSessionWrapper(inner as never);
    const result = await wrapper.send({ type: "navigate_tree", targetId: "leaf-2", summarize: true });
    expect(navigateTree).toHaveBeenCalledWith("leaf-2", { summarize: true });
    expect(result).toEqual({ cancelled: false });
  });
});
