"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { Scene } from "@/lib/scenes";

interface OAuthProvider {
  id: string;
  name: string;
  loggedIn: boolean;
}

interface Props {
  onComplete: () => void;
  onLaunchScene: (scene: Scene, prompt: string, workspaceCwd: string) => void;
}

type Step = 1 | 2 | 3 | 4;

async function savePreferences(patch: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

export function FirstRunWizard({ onComplete, onLaunchScene }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const [workspaceCwd, setWorkspaceCwd] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [oauthError, setOAuthError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [hasNativePicker, setHasNativePicker] = useState(false);

  useEffect(() => {
    setHasNativePicker(Boolean(window.piNative?.pickWorkspaceDirectory));
  }, []);

  const connectedCount = useMemo(
    () => providers.filter((provider) => provider.loggedIn).length,
    [providers],
  );

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const res = await fetch("/api/auth/providers");
      const data = await res.json() as { providers?: OAuthProvider[] };
      setProviders(data.providers ?? []);
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (step !== 4) return;
    setScenesLoading(true);
    fetch("/api/scenes")
      .then((res) => res.json())
      .then((data: { scenes?: Scene[] }) => setScenes((data.scenes ?? []).slice(0, 3)))
      .finally(() => setScenesLoading(false));
  }, [step]);

  const selectRecommendedWorkspace = useCallback(async () => {
    setWorkspaceError(null);
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = await res.json() as { cwd?: string; error?: string };
      if (!res.ok || !data.cwd) throw new Error(data.error ?? t("onboarding.workspaceError"));
      setWorkspaceCwd(data.cwd);
      await savePreferences({ defaultWorkspaceCwd: data.cwd });
      return data.cwd;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [t]);

  const pickNativeWorkspace = useCallback(async () => {
    setWorkspaceError(null);
    try {
      const nativePicker = window.piNative?.pickWorkspaceDirectory;
      if (!nativePicker) {
        return selectRecommendedWorkspace();
      }
      const picked = await nativePicker();
      if (!picked) return null;
      setWorkspaceCwd(picked);
      await savePreferences({ defaultWorkspaceCwd: picked });
      return picked;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [selectRecommendedWorkspace]);

  const saveCustomWorkspace = useCallback(async () => {
    const trimmed = customPath.trim();
    if (!trimmed) return null;
    setWorkspaceError(null);
    try {
      setWorkspaceCwd(trimmed);
      await savePreferences({ defaultWorkspaceCwd: trimmed });
      return trimmed;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [customPath]);

  const connectProvider = useCallback(async (provider: OAuthProvider) => {
    setOAuthError(null);
    setConnectingId(provider.id);
    try {
      const es = new EventSource(`/api/auth/login/${encodeURIComponent(provider.id)}`);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          es.close();
          reject(new Error(t("onboarding.oauthTimeout")));
        }, 120_000);
        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as { type?: string; message?: string };
            if (payload.type === "success") {
              window.clearTimeout(timeout);
              es.close();
              resolve();
            } else if (payload.type === "error") {
              window.clearTimeout(timeout);
              es.close();
              reject(new Error(payload.message ?? t("onboarding.oauthFailed")));
            }
          } catch {
            // ignore malformed events
          }
        };
        es.onerror = () => {
          window.clearTimeout(timeout);
          es.close();
          reject(new Error(t("onboarding.oauthFailed")));
        };
      });
      await loadProviders();
    } catch (error) {
      setOAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setConnectingId(null);
    }
  }, [loadProviders, t]);

  const finishOnboarding = useCallback(async () => {
    setFinishing(true);
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationsEnabled,
          defaultWorkspaceCwd: workspaceCwd ?? undefined,
          toolMode: "simple",
        }),
      });
      onComplete();
    } finally {
      setFinishing(false);
    }
  }, [notificationsEnabled, onComplete, workspaceCwd]);

  const handleLaunchScene = useCallback(async (scene: Scene) => {
    const cwd = workspaceCwd ?? await selectRecommendedWorkspace();
    if (!cwd) return;
    setFinishing(true);
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationsEnabled,
          defaultWorkspaceCwd: cwd,
          toolMode: "simple",
          lastOpenedSceneId: scene.id,
        }),
      });
      onLaunchScene(scene, scene.defaultPrompt, cwd);
    } finally {
      setFinishing(false);
    }
  }, [notificationsEnabled, onLaunchScene, selectRecommendedWorkspace, workspaceCwd]);

  return (
    <div className="flex h-dvh items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-[640px] rounded-[12px] border border-border bg-bg-panel p-6 shadow-sm">
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">
            {t("onboarding.stepIndicator", { current: step, total: 4 })}
          </div>
          <h1 className="m-0 mt-2 text-[22px] font-semibold text-text">
            {step === 1 && t("onboarding.workspaceTitle")}
            {step === 2 && t("onboarding.accountsTitle")}
            {step === 3 && t("onboarding.notificationsTitle")}
            {step === 4 && t("onboarding.firstChatTitle")}
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-text-muted">
            {step === 1 && t("onboarding.workspaceDescription")}
            {step === 2 && t("onboarding.accountsDescription")}
            {step === 3 && t("onboarding.notificationsDescription")}
            {step === 4 && t("onboarding.firstChatDescription")}
          </p>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void selectRecommendedWorkspace().then((cwd) => { if (cwd) setStep(2); })}
              className="w-full rounded-[8px] bg-accent px-4 py-3 text-left text-[13px] font-semibold text-white hover:bg-accent-hover"
            >
              {t("onboarding.useRecommendedFolder")}
            </button>
            {hasNativePicker && (
              <button
                type="button"
                onClick={() => void pickNativeWorkspace().then((cwd) => { if (cwd) setStep(2); })}
                className="w-full rounded-[8px] border border-border bg-bg-elevated px-4 py-3 text-left text-[13px] font-medium text-text hover:bg-bg-hover"
              >
                {t("onboarding.pickFolder")}
              </button>
            )}
            <div className="rounded-[8px] border border-border bg-bg-subtle p-3">
              <label className="text-[12px] font-medium text-text">{t("onboarding.customPath")}</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={customPath}
                  onChange={(event) => setCustomPath(event.target.value)}
                  placeholder={t("onboarding.customPathPlaceholder")}
                  className="min-w-0 flex-1 rounded-[6px] border border-border bg-bg px-3 py-2 text-[12px] text-text"
                />
                <button
                  type="button"
                  onClick={() => void saveCustomWorkspace().then((cwd) => { if (cwd) setStep(2); })}
                  className="rounded-[6px] border border-border bg-bg-elevated px-3 py-2 text-[12px] font-medium text-text hover:bg-bg-hover"
                >
                  {t("common.open")}
                </button>
              </div>
            </div>
            {workspaceCwd && (
              <div className="text-[12px] text-text-muted">{t("onboarding.selectedWorkspace", { path: workspaceCwd })}</div>
            )}
            {workspaceError && <div className="text-[12px] text-red-500">{workspaceError}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {providersLoading ? (
              <div className="text-[13px] text-text-muted">{t("common.loading")}</div>
            ) : (
              providers.slice(0, 4).map((provider) => (
                <div key={provider.id} className="flex items-center justify-between rounded-[8px] border border-border px-4 py-3">
                  <div>
                    <div className="text-[13px] font-medium text-text">{provider.name}</div>
                    <div className="text-[11px] text-text-dim">
                      {provider.loggedIn ? t("accounts.connected") : t("accounts.notConnected")}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={provider.loggedIn || connectingId === provider.id}
                    onClick={() => void connectProvider(provider)}
                    className="rounded-[6px] bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {connectingId === provider.id
                      ? t("accounts.connecting")
                      : provider.loggedIn
                        ? t("accounts.connected")
                        : t("accounts.connect")}
                  </button>
                </div>
              ))
            )}
            {oauthError && <div className="text-[12px] text-red-500">{oauthError}</div>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-[8px] border border-border px-4 py-3">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(event) => setNotificationsEnabled(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-[13px] font-medium text-text">{t("onboarding.enableNotifications")}</span>
                <span className="mt-1 block text-[12px] leading-5 text-text-muted">{t("onboarding.enableNotificationsHint")}</span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                if (notificationsEnabled && typeof Notification !== "undefined") {
                  void Notification.requestPermission();
                }
              }}
              className="rounded-[8px] border border-border bg-bg-elevated px-4 py-2 text-[12px] font-medium text-text hover:bg-bg-hover"
            >
              {t("onboarding.requestNotificationPermission")}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            {scenesLoading ? (
              <div className="text-[13px] text-text-muted">{t("common.loading")}</div>
            ) : scenes.length === 0 ? (
              <div className="text-[13px] text-text-muted">{t("onboarding.noScenes")}</div>
            ) : (
              scenes.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  disabled={finishing}
                  onClick={() => void handleLaunchScene(scene)}
                  className="w-full rounded-[8px] border border-border bg-bg-elevated px-4 py-3 text-left hover:bg-bg-hover disabled:opacity-50"
                >
                  <div className="text-[14px] font-semibold text-text">{scene.name}</div>
                  <div className="mt-1 text-[12px] leading-5 text-text-muted">{scene.description}</div>
                </button>
              ))
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 1 || finishing}
            onClick={() => setStep((current) => (current > 1 ? (current - 1) as Step : current))}
            className="rounded-[6px] border border-border px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-bg-hover disabled:opacity-40"
          >
            {t("onboarding.back")}
          </button>
          {step < 4 ? (
            <button
              type="button"
              disabled={
                finishing
                || (step === 1 && !workspaceCwd)
                || (step === 2 && connectedCount === 0)
              }
              onClick={() => setStep((current) => (current < 4 ? (current + 1) as Step : current))}
              className="rounded-[6px] bg-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("onboarding.next")}
            </button>
          ) : (
            <button
              type="button"
              disabled={finishing}
              onClick={() => void finishOnboarding()}
              className="rounded-[6px] bg-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("onboarding.finishLater")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
