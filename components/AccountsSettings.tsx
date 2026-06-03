"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface OAuthProvider {
  id: string;
  name: string;
  loggedIn: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

interface Props {
  onModelsChanged?: () => void;
  onOpenModels?: () => void;
}

export function AccountsSettings({ onModelsChanged, onOpenModels }: Props) {
  const { t } = useI18n();
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [modelList, setModelList] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<{ provider: string; modelId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providersRes, modelsRes] = await Promise.all([
        fetch("/api/auth/providers"),
        fetch("/api/models"),
      ]);
      const providersData = await providersRes.json() as { providers?: OAuthProvider[] };
      const modelsData = await modelsRes.json() as {
        modelList?: ModelOption[];
        defaultModel?: { provider: string; modelId: string } | null;
      };
      setProviders(providersData.providers ?? []);
      setModelList(modelsData.modelList ?? []);
      setDefaultModel(modelsData.defaultModel ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connectProvider = useCallback(async (provider: OAuthProvider) => {
    setConnectingId(provider.id);
    setError(null);
    try {
      const es = new EventSource(`/api/auth/login/${encodeURIComponent(provider.id)}`);
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          es.close();
          reject(new Error(t("accounts.oauthTimeout")));
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
              reject(new Error(payload.message ?? t("accounts.oauthFailed")));
            }
          } catch {
            // ignore malformed events
          }
        };
        es.onerror = () => {
          window.clearTimeout(timeout);
          es.close();
          reject(new Error(t("accounts.oauthFailed")));
        };
      });
      await refresh();
      onModelsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectingId(null);
    }
  }, [onModelsChanged, refresh, t]);

  const disconnectProvider = useCallback(async (providerId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/auth/logout/${encodeURIComponent(providerId)}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await refresh();
      onModelsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [onModelsChanged, refresh]);

  const handleDefaultModelChange = useCallback(async (value: string) => {
    const [provider, modelId] = value.split("::");
    if (!provider || !modelId) return;
    setSavingDefault(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/default-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, modelId }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDefaultModel({ provider, modelId });
      onModelsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDefault(false);
    }
  }, [onModelsChanged]);

  const connectedProviders = providers.filter((provider) => provider.loggedIn);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] px-5 py-5">
        <div className="mb-4 border-b border-border pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("accounts.platform")}</div>
          <h1 className="m-0 mt-1 text-[22px] font-semibold tracking-[0] text-text">{t("accounts.title")}</h1>
          <p className="mt-2 text-[13px] leading-6 text-text-muted">{t("accounts.description")}</p>
        </div>

        {loading && <div className="text-[13px] text-text-muted">{t("common.loading")}</div>}
        {error && <div className="mb-3 text-[13px] text-red-500">{error}</div>}

        {!loading && (
          <>
            <section className="mb-6">
              <h2 className="m-0 text-[15px] font-semibold text-text">{t("accounts.connectedServices")}</h2>
              {connectedProviders.length === 0 ? (
                <div className="mt-3 rounded-[8px] border border-border bg-bg-panel p-4 text-[13px] text-text-muted">
                  {t("accounts.noConnectedServices")}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {connectedProviders.map((provider) => (
                    <div key={provider.id} className="flex items-center justify-between rounded-[8px] border border-border bg-bg-panel px-4 py-3">
                      <div>
                        <div className="text-[13px] font-medium text-text">{provider.name}</div>
                        <div className="text-[11px] text-text-dim">{t("accounts.connected")}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void disconnectProvider(provider.id)}
                        className="rounded-[6px] border border-border px-3 py-2 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text"
                      >
                        {t("accounts.disconnect")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mb-6">
              <h2 className="m-0 text-[15px] font-semibold text-text">{t("accounts.addService")}</h2>
              <div className="mt-3 space-y-2">
                {providers.filter((provider) => !provider.loggedIn).map((provider) => (
                  <div key={provider.id} className="flex items-center justify-between rounded-[8px] border border-border bg-bg-panel px-4 py-3">
                    <div className="text-[13px] font-medium text-text">{provider.name}</div>
                    <button
                      type="button"
                      disabled={connectingId === provider.id}
                      onClick={() => void connectProvider(provider)}
                      className="rounded-[6px] bg-accent px-3 py-2 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {connectingId === provider.id ? t("accounts.connecting") : t("accounts.connect")}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-6">
              <h2 className="m-0 text-[15px] font-semibold text-text">{t("accounts.defaultModel")}</h2>
              <p className="mt-2 text-[12px] leading-5 text-text-muted">{t("accounts.defaultModelDescription")}</p>
              <select
                disabled={modelList.length === 0 || savingDefault}
                value={defaultModel ? `${defaultModel.provider}::${defaultModel.modelId}` : ""}
                onChange={(event) => void handleDefaultModelChange(event.target.value)}
                className="mt-3 w-full rounded-[8px] border border-border bg-bg-panel px-3 py-2 text-[13px] text-text"
              >
                <option value="">{t("accounts.selectDefaultModel")}</option>
                {modelList.map((model) => (
                  <option key={`${model.provider}:${model.id}`} value={`${model.provider}::${model.id}`}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[12px] leading-5 text-text-dim">{t("accounts.perSessionModelHint")}</p>
            </section>

            {onOpenModels && (
              <section>
                <h2 className="m-0 text-[15px] font-semibold text-text">{t("workbenchSettings.models")}</h2>
                <p className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.modelsDescription")}</p>
                <button
                  type="button"
                  onClick={onOpenModels}
                  className="mt-3 rounded-[7px] border border-border bg-bg-elevated px-4 py-2 text-[12px] font-medium text-text hover:bg-bg-hover"
                >
                  {t("accounts.openModelsConfig")}
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
