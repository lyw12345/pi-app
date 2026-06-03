import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentDir = vi.hoisted(() => ({ value: "" }));

vi.mock("@/lib/agent-dir", () => ({
  getAgentDir: () => agentDir.value,
}));

const sendNotification = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({
      publicKey: "public-key",
      privateKey: "private-key",
    }),
    setVapidDetails: vi.fn(),
    sendNotification,
  },
}));

describe("push notifications", () => {
  beforeEach(() => {
    agentDir.value = mkdtempSync(join(tmpdir(), "pi-push-"));
    sendNotification.mockClear();
  });

  afterEach(() => {
    rmSync(agentDir.value, { recursive: true, force: true });
  });

  it("stores subscriptions and sends notifications", async () => {
    const {
      addPushSubscription,
      getPushPublicStatus,
      notifyAgentFinished,
    } = await import("./push-notifications");

    addPushSubscription({
      endpoint: "https://push.example/subscription",
      keys: { p256dh: "p256dh", auth: "auth" },
    });

    expect(getPushPublicStatus().subscriptionCount).toBe(1);

    await notifyAgentFinished({ sessionId: "abcd1234", sessionName: "Test session" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
