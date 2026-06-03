import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import webpush from "web-push";
import { getAgentDir } from "@/lib/agent-dir";
import type { PushConfig, PushPublicStatus, PushSubscriptionRecord } from "./push-types";
import { PUSH_CONFIG_FILENAME } from "./push-types";

function configPath(): string {
  return join(getAgentDir(), PUSH_CONFIG_FILENAME);
}

function defaultConfig(keys: { publicKey: string; privateKey: string }): PushConfig {
  return {
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    subscriptions: [],
  };
}

export function loadPushConfig(): PushConfig | null {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as PushConfig;
    if (!parsed.vapidPublicKey || !parsed.vapidPrivateKey) return null;
    return {
      vapidPublicKey: parsed.vapidPublicKey,
      vapidPrivateKey: parsed.vapidPrivateKey,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
    };
  } catch {
    return null;
  }
}

export function savePushConfig(config: PushConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function ensurePushConfig(): PushConfig {
  const existing = loadPushConfig();
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  const config = defaultConfig(keys);
  savePushConfig(config);
  return config;
}

export function getPushPublicStatus(): PushPublicStatus {
  const config = loadPushConfig();
  if (!config) {
    return { enabled: false, publicKey: null, subscriptionCount: 0 };
  }
  return {
    enabled: true,
    publicKey: config.vapidPublicKey,
    subscriptionCount: config.subscriptions.length,
  };
}

export function addPushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): PushConfig {
  const config = ensurePushConfig();
  const filtered = config.subscriptions.filter((sub) => sub.endpoint !== input.endpoint);
  const record: PushSubscriptionRecord = {
    id: randomUUID(),
    endpoint: input.endpoint,
    keys: { p256dh: input.keys.p256dh, auth: input.keys.auth },
    createdAt: new Date().toISOString(),
    userAgent: input.userAgent,
  };
  const next: PushConfig = {
    ...config,
    subscriptions: [...filtered, record],
  };
  savePushConfig(next);
  return next;
}

export function removePushSubscription(endpoint: string): PushConfig {
  const config = ensurePushConfig();
  const next: PushConfig = {
    ...config,
    subscriptions: config.subscriptions.filter((sub) => sub.endpoint !== endpoint),
  };
  savePushConfig(next);
  return next;
}

function configureWebPush(config: PushConfig): void {
  webpush.setVapidDetails("mailto:pi-web@local", config.vapidPublicKey, config.vapidPrivateKey);
}

export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; failed: number }> {
  const config = loadPushConfig();
  if (!config || config.subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }
  configureWebPush(config);
  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const stale: string[] = [];

  await Promise.all(config.subscriptions.map(async (record) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: record.endpoint,
          keys: record.keys,
        },
        message,
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        stale.push(record.endpoint);
      }
    }
  }));

  if (stale.length > 0) {
    savePushConfig({
      ...config,
      subscriptions: config.subscriptions.filter((sub) => !stale.includes(sub.endpoint)),
    });
  }

  return { sent, failed };
}

export async function notifyAgentFinished(input: {
  sessionId: string;
  sessionName?: string;
}): Promise<void> {
  const title = input.sessionName?.trim() || "Pi agent finished";
  const body = `Session ${input.sessionId.slice(0, 8)} completed.`;
  await sendPushToAll({
    title,
    body,
    url: input.sessionId ? `/?session=${encodeURIComponent(input.sessionId)}` : "/",
    tag: `agent-end-${input.sessionId}`,
  });
}

export async function sendTestPush(): Promise<{ sent: number; failed: number }> {
  return sendPushToAll({
    title: "Pi Web",
    body: "Push notifications are working.",
    url: "/",
    tag: "pi-web-test",
  });
}
