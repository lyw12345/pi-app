"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { useI18n } from "@/lib/i18n/provider";
import { PushNotificationControls } from "./PushNotificationControls";
import { RemotePairingModal } from "./RemotePairingModal";

interface RemoteSession {
  id: string;
  createdAt: string;
  userAgent: string;
  lastSeenAt: string;
  label?: string;
}

interface RemoteStatus {
  enabled: boolean;
  readOnly: boolean;
  allowedHostnames: string[];
  sessionCount: number;
  hasMasterToken: boolean;
}

interface RemoteResponse {
  status?: RemoteStatus;
  sessions?: RemoteSession[];
  masterToken?: string;
  offer?: {
    code: string;
    expiresAt: string;
    pairingUrl: string;
  };
  relayOfferUrl?: string;
  error?: string;
}

interface AuditEvent {
  ts: string;
  type: string;
  ip?: string;
  path?: string;
  method?: string;
  sessionId?: string;
  reason?: string;
  detail?: string;
  userAgent?: string;
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-text-dim">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function RemoteAccessSettings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [masterToken, setMasterToken] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [allowedHostnamesText, setAllowedHostnamesText] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [pairingCopyState, setPairingCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [relayOfferUrl, setRelayOfferUrl] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const port = typeof window !== "undefined" ? window.location.port || "30141" : "30141";
  const relayCommands = {
    server: "npm run relay:server",
    host: "npm run relay:host",
    client: `npm run relay:client -- '<offer-url>'`,
  };
  const tunnelCommands = {
    tailscale: `tailscale funnel ${port}`,
    cloudflared: `npm run tunnel:cloudflare`,
    cloudflaredDirect: `cloudflared tunnel --url http://127.0.0.1:${port}`,
  };

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/remote");
      const data = (await res.json()) as RemoteResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to load remote settings");
      setStatus(data.status ?? null);
      setSessions(data.sessions ?? []);
      setAllowedHostnamesText((data.status?.allowedHostnames ?? []).join("\n"));
      setReadOnly(Boolean(data.status?.readOnly));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const loadAudit = useCallback(async () => {
    setAuditError(null);
    try {
      const res = await fetch("/api/remote/audit?limit=50");
      const data = (await res.json()) as { events?: AuditEvent[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("remoteAccess.auditLoadError"));
      setAuditEvents(data.events ?? []);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : String(err));
    }
  }, [t]);

  useEffect(() => {
    if (status?.enabled) {
      void loadAudit();
    }
  }, [status?.enabled, loadAudit]);

  const postAction = async (body: Record<string, unknown>) => {
    setBusy(String(body.action ?? "request"));
    setError(null);
    try {
      const res = await fetch("/api/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as RemoteResponse;
      if (!res.ok) throw new Error(data.error ?? "Remote action failed");
      setStatus(data.status ?? null);
      setSessions(data.sessions ?? sessions);
      if (data.masterToken) setMasterToken(data.masterToken);
      if (data.offer) {
        setPairingUrl(data.offer.pairingUrl);
        setQrDataUrl(await QRCode.toDataURL(data.offer.pairingUrl, { margin: 1, width: 480 }));
      }
      if (data.relayOfferUrl) setRelayOfferUrl(data.relayOfferUrl);
      void loadAudit();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleEnable = async () => {
    const allowedHostnames = allowedHostnamesText
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
    const data = await postAction({ action: "enable", allowedHostnames, readOnly });
    if (data?.status?.enabled) {
      openPairingModal();
    }
  };

  const handleDisable = () => {
    setMasterToken(null);
    setPairingUrl(null);
    setQrDataUrl(null);
    setPairingModalOpen(false);
    setWizardStep(0);
    void postAction({ action: "disable" });
  };

  const handleRotateToken = () => {
    void postAction({ action: "rotate-token" });
  };

  const openPairingModal = () => {
    setPairingModalOpen(true);
    setPairingCopyState("idle");
    void postAction({ action: "create-pairing" });
  };

  const closePairingModal = () => {
    setPairingModalOpen(false);
  };

  const handleSaveSettings = () => {
    const allowedHostnames = allowedHostnamesText
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
    void postAction({ action: "update-settings", allowedHostnames, readOnly });
  };

  const handleRevokeSession = (sessionId: string) => {
    void postAction({ action: "revoke-session", sessionId });
  };

  const handleRevokeAllSessions = () => {
    void postAction({ action: "revoke-all-sessions" });
  };

  const handleCreateRelayOffer = () => {
    void postAction({ action: "create-relay-offer" });
  };

  const handleCopyPairingUrl = async () => {
    if (!pairingUrl) return;
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setPairingCopyState("copied");
      window.setTimeout(() => setPairingCopyState("idle"), 1400);
    } catch {
      setPairingCopyState("failed");
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("remoteAccess.sectionLabel")}</div>
        <h2 className="m-0 mt-1 text-[15px] font-semibold text-text">{t("remoteAccess.title")}</h2>
        <p className="mt-2 max-w-[720px] text-[12px] leading-5 text-text-muted">{t("remoteAccess.description")}</p>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
        {loading && !status && (
          <div className="p-4 text-[13px] text-text-muted">{t("remoteAccess.loading")}</div>
        )}
        {error && !pairingModalOpen && (
          <div className="border-b border-border px-4 py-3 text-[13px] text-text-muted">{error}</div>
        )}

        {status && !status.enabled && (
          <div className="p-4">
            <div className="text-[13px] text-text-muted">{t("remoteAccess.disabled")}</div>
            {wizardStep === 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-[13px] font-medium text-text">{t("remoteAccess.wizardPurposeTitle")}</div>
                <p className="m-0 text-[12px] leading-5 text-text-muted">{t("remoteAccess.wizardPurposeBody")}</p>
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="mt-3 h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover"
                >
                  {t("remoteAccess.wizardNext")}
                </button>
              </div>
            )}
            {wizardStep === 1 && (
              <div className="mt-4 space-y-2">
                <div className="text-[13px] font-medium text-text">{t("remoteAccess.wizardRiskTitle")}</div>
                <p className="m-0 text-[12px] leading-5 text-text-muted">{t("remoteAccess.wizardRiskBody")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(0)}
                    className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover"
                  >
                    {t("common.back")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover"
                  >
                    {t("remoteAccess.wizardNext")}
                  </button>
                </div>
              </div>
            )}
            {wizardStep === 2 && (
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-[12px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(event) => setReadOnly(event.target.checked)}
                  />
                  {t("remoteAccess.readOnly")}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover"
                  >
                    {t("common.back")}
                  </button>
                  <button
                    onClick={() => void handleEnable()}
                    disabled={busy !== null}
                    className="h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy === "enable" ? t("remoteAccess.enabling") : t("remoteAccess.wizardEnable")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {status?.enabled && (
          <>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="text-[13px] font-medium text-text">{t("remoteAccess.enabled")}</div>
                <button
                  onClick={handleDisable}
                  disabled={busy !== null}
                  className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text disabled:opacity-50"
                >
                  {busy === "disable" ? t("remoteAccess.disabling") : t("remoteAccess.disable")}
                </button>
              </div>

              <button
                type="button"
                onClick={openPairingModal}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-hover disabled:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-text">{t("remoteAccess.pairingTitle")}</div>
                  <div className="mt-0.5 text-[11px] leading-5 text-text-dim">{t("remoteAccess.pairingRowHint")}</div>
                </div>
                <ChevronRightIcon />
              </button>

              {sessions.length > 0 && (
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-text">{t("remoteAccess.pairedDevices")}</div>
                    <button
                      onClick={handleRevokeAllSessions}
                      disabled={busy !== null}
                      className="text-[11px] text-text-muted hover:text-text"
                    >
                      {t("remoteAccess.revokeAll")}
                    </button>
                  </div>
                  <div className="divide-y divide-border rounded-[7px] border border-border">
                    {sessions.map((session) => (
                      <div key={session.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] text-text">{session.label || session.userAgent}</div>
                          <div className="text-[11px] text-text-dim">{new Date(session.lastSeenAt).toLocaleString()}</div>
                        </div>
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          disabled={busy !== null}
                          className="h-7 shrink-0 rounded-[6px] border border-border px-2 text-[11px] text-text-muted hover:bg-bg-hover"
                        >
                          {t("remoteAccess.revoke")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <details className="group border-t border-border">
              <summary className="cursor-pointer list-none px-4 py-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  {t("remoteAccess.developerSection")}
                  <span className="transition-transform group-open:rotate-90">
                    <ChevronRightIcon />
                  </span>
                </span>
              </summary>
              <div className="space-y-4 border-t border-border px-4 py-4">
                <div>
                  <label className="text-[12px] font-medium text-text">{t("remoteAccess.allowedHostnames")}</label>
                  <div className="mt-1 text-[11px] text-text-dim">{t("remoteAccess.allowedHostnamesHint")}</div>
                  <textarea
                    value={allowedHostnamesText}
                    onChange={(event) => setAllowedHostnamesText(event.target.value)}
                    rows={3}
                    placeholder={t("remoteAccess.allowedHostnamesPlaceholder")}
                    className="mt-2 w-full rounded-[7px] border border-border bg-bg-subtle px-3 py-2 font-mono text-[11px] text-text outline-none focus:border-accent"
                  />
                </div>

                <label className="flex items-center gap-2 text-[12px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(event) => setReadOnly(event.target.checked)}
                  />
                  {t("remoteAccess.readOnly")}
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveSettings}
                    disabled={busy !== null}
                    className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text disabled:opacity-50"
                  >
                    {t("remoteAccess.saveSettings")}
                  </button>
                  <button
                    onClick={handleRotateToken}
                    disabled={busy !== null}
                    className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text disabled:opacity-50"
                  >
                    {busy === "rotate-token" ? t("remoteAccess.rotatingToken") : t("remoteAccess.rotateToken")}
                  </button>
                </div>

                {masterToken && (
                  <div className="rounded-[7px] border border-border bg-bg-subtle p-3">
                    <div className="text-[12px] font-semibold text-text">{t("remoteAccess.masterTokenTitle")}</div>
                    <div className="mt-1 text-[11px] leading-5 text-text-muted">{t("remoteAccess.masterTokenHint")}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="break-all rounded-[6px] bg-bg-panel px-2 py-1 font-mono text-[11px] text-text">{masterToken}</code>
                      <button
                        onClick={() => handleCopy(masterToken)}
                        className="h-7 rounded-[6px] border border-border px-2 text-[11px] text-text-muted hover:bg-bg-hover"
                      >
                        {copyState === "copied" ? t("common.copied") : copyState === "failed" ? t("common.failed") : t("common.copy")}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[7px] border border-border bg-bg-subtle p-4">
                    <div className="text-[12px] font-semibold text-text">{t("remoteAccess.tunnelTitle")}</div>
                    <div className="mt-1 text-[11px] leading-5 text-text-muted">{t("remoteAccess.tunnelDescription")}</div>
                    <div className="mt-3 space-y-3">
                      {([
                        ["remoteAccess.tunnelTailscale", tunnelCommands.tailscale],
                        ["remoteAccess.tunnelCloudflared", tunnelCommands.cloudflared],
                      ] as const).map(([labelKey, command]) => (
                        <div key={labelKey}>
                          <div className="text-[11px] font-medium text-text">{t(labelKey)}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <code className="break-all rounded-[6px] bg-bg-panel px-2 py-1 font-mono text-[11px] text-text">{command}</code>
                            <button
                              onClick={() => handleCopy(command)}
                              className="h-7 rounded-[6px] border border-border px-2 text-[11px] text-text-muted hover:bg-bg-hover"
                            >
                              {t("common.copy")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[7px] border border-border bg-bg-subtle p-4">
                    <div className="text-[12px] font-semibold text-text">{t("remoteAccess.pushTitle")}</div>
                    <PushNotificationControls />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[7px] border border-border bg-bg-subtle p-4">
                    <div className="text-[12px] font-semibold text-text">{t("remoteAccess.relayE2eeTitle")}</div>
                    <div className="mt-1 text-[11px] leading-5 text-text-muted">{t("remoteAccess.relayE2eeDescription")}</div>
                    <button
                      onClick={handleCreateRelayOffer}
                      disabled={busy !== null}
                      className="mt-3 h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      {busy === "create-relay-offer" ? t("remoteAccess.relayGeneratingOffer") : t("remoteAccess.relayGenerateOffer")}
                    </button>
                    {relayOfferUrl && (
                      <div className="mt-3 rounded-[7px] border border-border bg-bg-panel p-3">
                        <div className="text-[12px] font-semibold text-text">{t("remoteAccess.relayOfferTitle")}</div>
                        <div className="mt-1 text-[11px] text-text-muted">{t("remoteAccess.relayOfferHint")}</div>
                        <code className="mt-2 block break-all rounded-[6px] bg-bg-subtle px-2 py-1 font-mono text-[11px] text-text">{relayOfferUrl}</code>
                        <button
                          onClick={() => handleCopy(relayOfferUrl)}
                          className="mt-2 h-7 rounded-[6px] border border-border px-2 text-[11px] text-text-muted hover:bg-bg-hover"
                        >
                          {t("common.copy")}
                        </button>
                      </div>
                    )}
                    <div className="mt-3 space-y-3">
                      {([
                        ["remoteAccess.relayServerCmd", relayCommands.server],
                        ["remoteAccess.relayHostCmd", relayCommands.host],
                        ["remoteAccess.relayClientCmd", relayOfferUrl ? relayCommands.client.replace("<offer-url>", relayOfferUrl) : relayCommands.client],
                      ] as const).map(([labelKey, command]) => (
                        <div key={labelKey}>
                          <div className="text-[11px] font-medium text-text">{t(labelKey)}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <code className="break-all rounded-[6px] bg-bg-panel px-2 py-1 font-mono text-[11px] text-text">{command}</code>
                            <button
                              onClick={() => handleCopy(command)}
                              className="h-7 rounded-[6px] border border-border px-2 text-[11px] text-text-muted hover:bg-bg-hover"
                            >
                              {t("common.copy")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[7px] border border-border bg-bg-subtle p-4">
                    <div className="text-[12px] font-semibold text-text">{t("remoteAccess.auditTitle")}</div>
                    <div className="mt-1 text-[11px] leading-5 text-text-muted">{t("remoteAccess.auditDescription")}</div>
                    {auditError && <div className="mt-2 text-[11px] text-text-muted">{auditError}</div>}
                    <div className="mt-3 max-h-[280px] overflow-y-auto rounded-[7px] border border-border">
                      {auditEvents.length === 0 ? (
                        <div className="px-3 py-4 text-[12px] text-text-muted">{t("remoteAccess.auditEmpty")}</div>
                      ) : (
                        auditEvents.map((event) => (
                          <div key={`${event.ts}-${event.type}-${event.path ?? ""}`} className="border-b border-border px-3 py-2 last:border-b-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="font-mono text-text-dim">{new Date(event.ts).toLocaleString()}</span>
                              <span className="rounded-[4px] bg-bg-panel px-1.5 py-0.5 font-mono text-[10px] text-text">{event.type}</span>
                            </div>
                            {(event.reason || event.detail || event.path) && (
                              <div className="mt-1 text-[11px] text-text-muted">
                                {[event.method, event.path, event.reason, event.detail].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </>
        )}
      </div>

      <RemotePairingModal
        open={pairingModalOpen}
        onClose={closePairingModal}
        pairingUrl={pairingUrl}
        qrDataUrl={qrDataUrl}
        loading={busy === "create-pairing"}
        error={pairingModalOpen ? error : null}
        copyState={pairingCopyState}
        onCopy={() => void handleCopyPairingUrl()}
      />
    </section>
  );
}
