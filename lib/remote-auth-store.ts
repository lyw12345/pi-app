import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getAgentDir } from "@/lib/agent-dir";
import type { RemoteAuthConfig } from "./remote-auth-types";
import { REMOTE_CONFIG_FILENAME } from "./remote-auth-types";

function configPath(): string {
  return join(getAgentDir(), REMOTE_CONFIG_FILENAME);
}

function defaultConfig(signingSecret: string): RemoteAuthConfig {
  return {
    enabled: false,
    signingSecret,
    allowedHostnames: [],
    sessions: [],
    pairingCodes: [],
    readOnly: false,
  };
}

export function loadRemoteAuthConfig(): RemoteAuthConfig | null {
  const path = configPath();
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as RemoteAuthConfig;
    if (!parsed.signingSecret || typeof parsed.signingSecret !== "string") return null;
    return {
      enabled: Boolean(parsed.enabled),
      tokenHash: parsed.tokenHash,
      signingSecret: parsed.signingSecret,
      allowedHostnames: Array.isArray(parsed.allowedHostnames) ? parsed.allowedHostnames : [],
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.map((session) => ({
            id: String(session.id ?? ""),
            createdAt: String(session.createdAt ?? ""),
            userAgent: String(session.userAgent ?? "unknown"),
            lastSeenAt: String(session.lastSeenAt ?? session.createdAt ?? ""),
            label: typeof session.label === "string" ? session.label : undefined,
          }))
        : [],
      pairingCodes: Array.isArray(parsed.pairingCodes) ? parsed.pairingCodes : [],
      readOnly: Boolean(parsed.readOnly),
      relay: parsed.relay && typeof parsed.relay.serverId === "string"
        ? {
            serverId: parsed.relay.serverId,
            hostPublicKeyB64: String(parsed.relay.hostPublicKeyB64 ?? ""),
            hostPrivateKeyB64: String(parsed.relay.hostPrivateKeyB64 ?? ""),
            defaultEndpoint: String(parsed.relay.defaultEndpoint ?? "http://127.0.0.1:30142"),
          }
        : undefined,
    };
  } catch {
    return null;
  }
}

export function saveRemoteAuthConfig(config: RemoteAuthConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  syncRemoteAuthEnv(config);
}

export function syncRemoteAuthEnv(config: RemoteAuthConfig): void {
  if (config.enabled) {
    process.env.PI_WEB_REMOTE = "1";
    process.env.PI_WEB_REMOTE_SIGNING_SECRET = config.signingSecret;
    if (config.tokenHash) {
      process.env.PI_WEB_REMOTE_TOKEN_HASH = config.tokenHash;
    } else {
      delete process.env.PI_WEB_REMOTE_TOKEN_HASH;
    }
    if (config.readOnly) {
      process.env.PI_WEB_REMOTE_READ_ONLY = "1";
    } else {
      delete process.env.PI_WEB_REMOTE_READ_ONLY;
    }
  } else {
    delete process.env.PI_WEB_REMOTE;
    delete process.env.PI_WEB_REMOTE_SIGNING_SECRET;
    delete process.env.PI_WEB_REMOTE_TOKEN_HASH;
    delete process.env.PI_WEB_REMOTE_READ_ONLY;
  }
}

export function ensureRemoteAuthConfig(): RemoteAuthConfig {
  const existing = loadRemoteAuthConfig();
  if (existing) {
    syncRemoteAuthEnv(existing);
    return existing;
  }
  const config = defaultConfig(randomBytes(32).toString("base64url"));
  saveRemoteAuthConfig(config);
  return config;
}
