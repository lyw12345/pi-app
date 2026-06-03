import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@/lib/agent-dir";

export const REMOTE_AUDIT_FILENAME = "pi-web-remote-audit.jsonl";

export type RemoteAuditEventType =
  | "auth_failure"
  | "auth_success"
  | "pairing_created"
  | "pairing_redeemed"
  | "remote_enabled"
  | "remote_disabled"
  | "token_rotated"
  | "settings_updated"
  | "session_revoked"
  | "session_renamed"
  | "sessions_revoked_all"
  | "relay_offer_created";

export interface RemoteAuditEvent {
  ts: string;
  type: RemoteAuditEventType;
  ip?: string;
  path?: string;
  method?: string;
  sessionId?: string;
  userAgent?: string;
  reason?: string;
  detail?: string;
}

function auditPath(): string {
  return join(getAgentDir(), REMOTE_AUDIT_FILENAME);
}

export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return undefined;
}

export function appendRemoteAuditEvent(event: Omit<RemoteAuditEvent, "ts">): RemoteAuditEvent {
  const record: RemoteAuditEvent = { ts: new Date().toISOString(), ...event };
  const path = auditPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export function readRemoteAuditEvents(limit = 100): RemoteAuditEvent[] {
  const path = auditPath();
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    return lines
      .slice(-limit)
      .map((line) => JSON.parse(line) as RemoteAuditEvent)
      .reverse();
  } catch {
    return [];
  }
}
