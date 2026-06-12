import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveLanOrigin } from "./lan-origin";
import { buildConnectionOffer, buildOfferUrl } from "./pi-relay/connection-offer";
import { generateRelayKeyPair } from "./pi-relay/crypto";
import { DEFAULT_RELAY_ENDPOINT } from "./pi-relay/types";
import { appendRemoteAuditEvent, getClientIp } from "./remote-audit-log";
import {
  PAIRING_CODE_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  type RemoteAuthConfig,
  type RemoteAuthPublicStatus,
  type RemotePairingOffer,
  type RemoteRelayConfig,
} from "./remote-auth-types";
import {
  ensureRemoteAuthConfig,
  loadRemoteAuthConfig,
  saveRemoteAuthConfig,
  syncRemoteAuthEnv,
} from "./remote-auth-store";

const SCRYPT_KEYLEN = 32;

export function isRemoteAccessEnabled(): boolean {
  if (process.env.PI_WEB_REMOTE === "1") return true;
  const config = loadRemoteAuthConfig();
  return Boolean(config?.enabled);
}

export function getSigningSecret(): string | null {
  return process.env.PI_WEB_REMOTE_SIGNING_SECRET
    ?? loadRemoteAuthConfig()?.signingSecret
    ?? null;
}

export function hashSecret(value: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(value, salt, SCRYPT_KEYLEN);
  return `${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export function verifySecret(value: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(".");
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(value, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSessionCookieValue(sessionId: string, expiresAtMs: number, secret: string): string {
  const payload = `${sessionId}.${expiresAtMs}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

export function parseSessionCookieValue(value: string, secret: string): { sessionId: string; expiresAtMs: number } | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, expiresRaw, signature] = parts;
  if (!sessionId || !expiresRaw || !signature) return null;
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  const payload = `${sessionId}.${expiresRaw}`;
  const expected = signPayload(payload, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  if (Date.now() > expiresAtMs) return null;
  return { sessionId, expiresAtMs };
}

export function getSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE_NAME.length + 1));
    }
  }
  return null;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function hostnameFromHost(host: string | null | undefined): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(1, end);
  }
  return trimmed.split(":")[0] ?? "";
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname === "0:0:0:0:0:0:0:1" || hostname.startsWith("127.");
}

export function isLoopbackRequest(req: Request): boolean {
  return isLoopbackHostname(hostnameFromHost(req.headers.get("host")));
}

function hostnameFromOrigin(origin: string | null | undefined): string {
  if (!origin) return "";
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isSameOriginLoopbackRequest(req: Request): boolean {
  const hostName = hostnameFromHost(req.headers.get("host"));
  if (!isLoopbackHostname(hostName)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  return hostnameFromOrigin(origin) === hostName;
}

function isAllowedHostname(req: Request, config: RemoteAuthConfig): boolean {
  if (config.allowedHostnames.length === 0) return true;
  const hostName = hostnameFromHost(req.headers.get("host"));
  return config.allowedHostnames.some((allowed) => allowed.toLowerCase() === hostName);
}

function sessionExists(config: RemoteAuthConfig, sessionId: string): boolean {
  return config.sessions.some((session) => session.id === sessionId);
}

function touchSession(config: RemoteAuthConfig, sessionId: string, userAgent: string): RemoteAuthConfig {
  const now = new Date().toISOString();
  return {
    ...config,
    sessions: config.sessions.map((session) =>
      session.id === sessionId ? { ...session, lastSeenAt: now, userAgent: userAgent || session.userAgent } : session
    ),
  };
}

export interface RequestAuthContext {
  authorized: boolean;
  loopback: boolean;
  remoteEnabled: boolean;
  sessionId: string | null;
  readOnly: boolean;
  reason: string | null;
}

export function getClientRemoteContext(req: Request): {
  remoteEnabled: boolean;
  authenticated: boolean;
  readOnly: boolean;
  loopback: boolean;
} {
  const loopback = isLoopbackRequest(req);
  const remoteEnabled = isRemoteAccessEnabled();
  if (!remoteEnabled) {
    return { remoteEnabled: false, authenticated: true, readOnly: false, loopback };
  }
  if (loopback && isSameOriginLoopbackRequest(req)) {
    return { remoteEnabled: true, authenticated: true, readOnly: false, loopback: true };
  }
  const auth = authorizeRequest(req);
  return {
    remoteEnabled: true,
    authenticated: auth.authorized,
    readOnly: auth.readOnly,
    loopback: auth.loopback,
  };
}

export function authorizeRequestEdge(req: Request): RequestAuthContext {
  const loopback = isLoopbackRequest(req);
  const remoteEnabled = process.env.PI_WEB_REMOTE === "1";

  if (!remoteEnabled) {
    if (loopback && isSameOriginLoopbackRequest(req)) {
      return { authorized: true, loopback: true, remoteEnabled: false, sessionId: null, readOnly: false, reason: null };
    }
    return {
      authorized: false,
      loopback,
      remoteEnabled: false,
      sessionId: null,
      readOnly: false,
      reason: loopback ? "Cross-origin request rejected" : "Remote access is disabled",
    };
  }

  if (loopback && isSameOriginLoopbackRequest(req)) {
    return {
      authorized: true,
      loopback: true,
      remoteEnabled: true,
      sessionId: null,
      readOnly: false,
      reason: null,
    };
  }

  const envToken = process.env.PI_WEB_REMOTE_TOKEN;
  const bearer = getBearerToken(req);
  if (envToken && bearer && bearer.length === envToken.length && timingSafeEqual(Buffer.from(bearer), Buffer.from(envToken))) {
    return {
      authorized: true,
      loopback,
      remoteEnabled: true,
      sessionId: null,
      readOnly: process.env.PI_WEB_REMOTE_READ_ONLY === "1",
      reason: null,
    };
  }

  const secret = getSigningSecret();
  const cookieValue = getSessionCookie(req);
  if (secret && cookieValue && parseSessionCookieValue(cookieValue, secret)) {
    return {
      authorized: true,
      loopback,
      remoteEnabled: true,
      sessionId: null,
      readOnly: process.env.PI_WEB_REMOTE_READ_ONLY === "1",
      reason: null,
    };
  }

  if (process.env.PI_WEB_ALLOW_REMOTE_MUTATIONS === "1") {
    return {
      authorized: true,
      loopback,
      remoteEnabled: true,
      sessionId: null,
      readOnly: false,
      reason: null,
    };
  }

  return {
    authorized: false,
    loopback,
    remoteEnabled: true,
    sessionId: null,
    readOnly: false,
    reason: "Authentication required",
  };
}

export function authorizeRequest(req: Request): RequestAuthContext {
  const loopback = isLoopbackRequest(req);
  const config = loadRemoteAuthConfig();
  const remoteEnabled = Boolean(config?.enabled) || process.env.PI_WEB_REMOTE === "1";

  if (process.env.PI_WEB_ALLOW_REMOTE_MUTATIONS === "1") {
    return {
      authorized: true,
      loopback,
      remoteEnabled,
      sessionId: null,
      readOnly: false,
      reason: null,
    };
  }

  if (!remoteEnabled) {
    if (loopback && isSameOriginLoopbackRequest(req)) {
      return { authorized: true, loopback: true, remoteEnabled: false, sessionId: null, readOnly: false, reason: null };
    }
    return {
      authorized: false,
      loopback,
      remoteEnabled: false,
      sessionId: null,
      readOnly: false,
      reason: loopback ? "Cross-origin request rejected" : "Remote access is disabled",
    };
  }

  if (loopback && isSameOriginLoopbackRequest(req)) {
    return {
      authorized: true,
      loopback: true,
      remoteEnabled: true,
      sessionId: null,
      readOnly: false,
      reason: null,
    };
  }

  if (config && !isAllowedHostname(req, config)) {
    return {
      authorized: false,
      loopback,
      remoteEnabled: true,
      sessionId: null,
      readOnly: Boolean(config.readOnly),
      reason: "Host is not allowed for remote access",
    };
  }

  const envToken = process.env.PI_WEB_REMOTE_TOKEN;
  const bearer = getBearerToken(req);
  if (envToken && bearer && bearer.length === envToken.length && timingSafeEqual(Buffer.from(bearer), Buffer.from(envToken))) {
    return {
      authorized: true,
      loopback,
      remoteEnabled: true,
      sessionId: null,
      readOnly: Boolean(config?.readOnly),
      reason: null,
    };
  }

  if (config?.tokenHash && bearer && verifySecret(bearer, config.tokenHash)) {
    return {
      authorized: true,
      loopback,
      remoteEnabled: true,
      sessionId: null,
      readOnly: Boolean(config.readOnly),
      reason: null,
    };
  }

  const secret = getSigningSecret();
  const cookieValue = getSessionCookie(req);
  if (secret && cookieValue) {
    const parsed = parseSessionCookieValue(cookieValue, secret);
    if (parsed && config && sessionExists(config, parsed.sessionId)) {
      return {
        authorized: true,
        loopback,
        remoteEnabled: true,
        sessionId: parsed.sessionId,
        readOnly: Boolean(config.readOnly),
        reason: null,
      };
    }
  }

  return {
    authorized: false,
    loopback,
    remoteEnabled: true,
    sessionId: null,
    readOnly: Boolean(config?.readOnly),
    reason: "Authentication required",
  };
}

export function isMutatingMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

export function isAuthorizedForRequest(req: Request): boolean {
  const auth = authorizeRequest(req);
  if (!auth.authorized) return false;
  if (auth.readOnly && isMutatingMethod(req.method)) return false;
  return true;
}

export function buildSessionSetCookie(req: Request, value: string, maxAgeSec: number): string {
  const secure = req.url.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function buildSessionClearCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getPublicRemoteStatus(): RemoteAuthPublicStatus {
  const config = loadRemoteAuthConfig() ?? ensureRemoteAuthConfig();
  return {
    enabled: config.enabled,
    readOnly: Boolean(config.readOnly),
    allowedHostnames: config.allowedHostnames,
    sessionCount: config.sessions.length,
    hasMasterToken: Boolean(config.tokenHash),
  };
}

export function enableRemoteAccess(options?: { readOnly?: boolean; allowedHostnames?: string[] }): {
  config: RemoteAuthConfig;
  masterToken: string | null;
} {
  const config = ensureRemoteAuthConfig();
  const masterToken = randomBytes(24).toString("base64url");
  const next: RemoteAuthConfig = {
    ...config,
    enabled: true,
    tokenHash: hashSecret(masterToken),
    allowedHostnames: options?.allowedHostnames ?? config.allowedHostnames,
    readOnly: options?.readOnly ?? false,
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "remote_enabled" });
  return { config: next, masterToken };
}

export function disableRemoteAccess(): RemoteAuthConfig {
  const config = ensureRemoteAuthConfig();
  const next: RemoteAuthConfig = {
    ...config,
    enabled: false,
    sessions: [],
    pairingCodes: [],
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "remote_disabled" });
  return next;
}

export function rotateMasterToken(): { config: RemoteAuthConfig; masterToken: string } {
  const config = ensureRemoteAuthConfig();
  const masterToken = randomBytes(24).toString("base64url");
  const next: RemoteAuthConfig = {
    ...config,
    tokenHash: hashSecret(masterToken),
    sessions: [],
    pairingCodes: [],
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "token_rotated" });
  return { config: next, masterToken };
}

export function updateRemoteSettings(input: {
  allowedHostnames?: string[];
  readOnly?: boolean;
}): RemoteAuthConfig {
  const config = ensureRemoteAuthConfig();
  const next: RemoteAuthConfig = {
    ...config,
    allowedHostnames: input.allowedHostnames ?? config.allowedHostnames,
    readOnly: input.readOnly ?? config.readOnly,
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "settings_updated" });
  return next;
}

export function revokeRemoteSession(sessionId: string): RemoteAuthConfig {
  const config = ensureRemoteAuthConfig();
  const next: RemoteAuthConfig = {
    ...config,
    sessions: config.sessions.filter((session) => session.id !== sessionId),
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "session_revoked", sessionId });
  return next;
}

export function revokeAllRemoteSessions(): RemoteAuthConfig {
  const config = ensureRemoteAuthConfig();
  const next: RemoteAuthConfig = {
    ...config,
    sessions: [],
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "sessions_revoked_all", detail: `${config.sessions.length} sessions` });
  return next;
}

export function renameRemoteSession(sessionId: string, label: string): RemoteAuthConfig {
  const config = ensureRemoteAuthConfig();
  const trimmed = label.trim();
  const next: RemoteAuthConfig = {
    ...config,
    sessions: config.sessions.map((session) =>
      session.id === sessionId ? { ...session, label: trimmed || undefined } : session
    ),
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({ type: "session_renamed", sessionId, detail: trimmed });
  return next;
}

export function createRelayOffer(req: Request, relayEndpoint?: string): {
  offerUrl: string;
  relay: RemoteRelayConfig;
} {
  const config = ensureRemoteAuthConfig();
  if (!config.enabled) {
    throw new Error("Remote access is not enabled");
  }
  const keyPair = generateRelayKeyPair();
  const serverId = config.relay?.serverId ?? randomUUID();
  const endpoint = relayEndpoint?.trim() || config.relay?.defaultEndpoint || DEFAULT_RELAY_ENDPOINT;
  const relay: RemoteRelayConfig = {
    serverId,
    hostPublicKeyB64: keyPair.publicKeyB64,
    hostPrivateKeyB64: keyPair.privateKeyB64,
    defaultEndpoint: endpoint,
  };
  saveRemoteAuthConfig({ ...config, relay });
  const offer = buildConnectionOffer({
    serverId,
    hostPublicKeyB64: keyPair.publicKeyB64,
    relayEndpoint: endpoint,
  });
  const origin = new URL(req.url).origin;
  const offerUrl = buildOfferUrl(origin, offer);
  appendRemoteAuditEvent({ type: "relay_offer_created", detail: serverId });
  return { offerUrl, relay: { ...relay, hostPrivateKeyB64: "" } };
}

export function getRelayConfigForHost(): RemoteRelayConfig | null {
  const config = loadRemoteAuthConfig();
  if (!config?.relay?.hostPrivateKeyB64) return null;
  return config.relay;
}

export function createPairingOffer(req: Request): RemotePairingOffer {
  const config = ensureRemoteAuthConfig();
  if (!config.enabled) {
    throw new Error("Remote access is not enabled");
  }
  const code = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
  const pairingCodes = [
    ...config.pairingCodes.filter((entry) => new Date(entry.expiresAt).getTime() > Date.now()),
    { code, expiresAt },
  ];
  saveRemoteAuthConfig({ ...config, pairingCodes });
  appendRemoteAuditEvent({ type: "pairing_created" });
  const origin = resolveLanOrigin(req.url);
  return {
    code,
    expiresAt,
    pairingUrl: `${origin}/?pair=${encodeURIComponent(code)}`,
  };
}

export function redeemPairingCode(req: Request, code: string): { cookieValue: string; maxAgeSec: number } {
  const config = loadRemoteAuthConfig();
  if (!config?.enabled) {
    throw new Error("Remote access is not enabled");
  }
  const now = Date.now();
  const match = config.pairingCodes.find((entry) => entry.code === code && new Date(entry.expiresAt).getTime() > now);
  if (!match) {
    throw new Error("Invalid or expired pairing code");
  }
  const sessionId = randomUUID();
  const createdAt = new Date().toISOString();
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const expiresAtMs = now + SESSION_TTL_MS;
  const secret = config.signingSecret;
  const cookieValue = issueSessionCookieValue(sessionId, expiresAtMs, secret);
  const next: RemoteAuthConfig = {
    ...config,
    pairingCodes: config.pairingCodes.filter((entry) => entry.code !== code),
    sessions: [
      ...config.sessions,
      { id: sessionId, createdAt, userAgent, lastSeenAt: createdAt },
    ],
  };
  saveRemoteAuthConfig(next);
  appendRemoteAuditEvent({
    type: "pairing_redeemed",
    sessionId,
    userAgent,
    ip: getClientIp(req),
  });
  return { cookieValue, maxAgeSec: Math.floor(SESSION_TTL_MS / 1000) };
}

export function recordAuthorizedSessionTouch(req: Request, auth: RequestAuthContext): void {
  if (!auth.sessionId) return;
  const config = loadRemoteAuthConfig();
  if (!config) return;
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  saveRemoteAuthConfig(touchSession(config, auth.sessionId, userAgent));
}

export function logRemoteAuthFailure(req: Request, auth: RequestAuthContext): void {
  if (auth.authorized) return;
  appendRemoteAuditEvent({
    type: "auth_failure",
    reason: auth.reason ?? "Unauthorized",
    path: new URL(req.url).pathname,
    method: req.method,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
}

export function rejectUnauthorizedRequest(req: Request): NextResponse | null {
  const auth = authorizeRequest(req);
  if (!auth.authorized) {
    logRemoteAuthFailure(req, auth);
    return NextResponse.json({ error: auth.reason ?? "Unauthorized" }, { status: 401 });
  }
  if (auth.readOnly && isMutatingMethod(req.method)) {
    return NextResponse.json({ error: "Remote access is read-only" }, { status: 403 });
  }
  recordAuthorizedSessionTouch(req, auth);
  return null;
}

export function rejectUnauthorizedMutation(req: Request): NextResponse | null {
  return rejectUnauthorizedRequest(req);
}

// Re-export env sync for startup
export { syncRemoteAuthEnv };
