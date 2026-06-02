"use client";

import { useState } from "react";
import { useCachedResource, invalidateControlResource } from "@/hooks/useControlCollection";
import { useI18n } from "@/lib/i18n/provider";
import type { AutomationEntry } from "@/lib/automation";
import type { UsageSummary } from "@/lib/usage";
import { type Scene } from "@/lib/scenes";
import { SceneConfigEditor } from "./SceneConfigEditor";

interface Props {
  onOpenModels: () => void;
  onOpenSkills: () => void;
  onOpenSceneId: (sceneId: string) => void;
  skillsDisabled?: boolean;
}

interface AutomationRunResponse {
  automation?: AutomationEntry;
  prompt?: string;
  error?: string;
}

interface UsageResponse {
  usage?: UsageSummary;
  error?: string;
}

interface AutomationResponse {
  automation?: AutomationEntry[];
  error?: string;
}

interface ScenesResponse {
  scenes?: Scene[];
  error?: string;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const fetchUsage = async (): Promise<UsageSummary> => {
  const res = await fetch("/api/usage");
  const data = (await res.json()) as UsageResponse;
  if (data.error) throw new Error(data.error);
  if (!data.usage) throw new Error("Usage data missing from response");
  return data.usage;
};

const fetchAutomation = async (): Promise<AutomationEntry[]> => {
  const res = await fetch("/api/automation");
  const data = (await res.json()) as AutomationResponse;
  if (data.error) throw new Error(data.error);
  return data.automation ?? [];
};

const fetchScenes = async (): Promise<Scene[]> => {
  const res = await fetch("/api/scenes");
  const data = (await res.json()) as ScenesResponse;
  if (data.error) throw new Error(data.error);
  return data.scenes ?? [];
};

function translateSettingsError(message: string | null, t: ReturnType<typeof useI18n>["t"]): string | null {
  if (!message) return null;
  if (message === "Usage data missing from response") return t("workbenchSettings.usageMissing");
  if (message === "Unable to prepare automation run") return t("workbenchSettings.unableToPrepareRun");
  return message;
}

export function WorkbenchSettings({ onOpenModels, onOpenSkills, onOpenSceneId, skillsDisabled }: Props) {
  const { locale, setLocale, t } = useI18n();
  const usage = useCachedResource<UsageSummary>("workbench:usage", fetchUsage, {
    staleMs: 15_000,
    retries: 1,
  });
  const automation = useCachedResource<AutomationEntry[]>(
    "workbench:automation",
    fetchAutomation,
    { staleMs: 15_000, retries: 1 },
  );
  const scenes = useCachedResource<Scene[]>("workbench:scenes", fetchScenes, {
    staleMs: 15_000,
    retries: 1,
  });
  const [runningId, setRunningId] = useState<string | null>(null);
  const [preparedRun, setPreparedRun] = useState<{ automation: AutomationEntry; prompt: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [sceneEditorOpen, setSceneEditorOpen] = useState(false);

  const handlePrepareRun = async (entry: AutomationEntry) => {
    setRunningId(entry.id);
    setCopyState("idle");
    setPrepareError(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: entry.id }),
      });
      const data = (await res.json()) as AutomationRunResponse;
      if (!res.ok || !data.automation || !data.prompt) {
        throw new Error(data.error ?? "Unable to prepare automation run");
      }
      setPreparedRun({ automation: data.automation, prompt: data.prompt });
      invalidateControlResource("workbench:automation");
      invalidateControlResource("workbench:usage");
    } catch (err) {
      setPrepareError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningId(null);
    }
  };

  const handleCopyPrompt = async () => {
    if (!preparedRun?.prompt) return;
    try {
      await navigator.clipboard.writeText(preparedRun.prompt);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("failed");
    }
  };

  const usageError = translateSettingsError(usage.error, t);
  const automationError = translateSettingsError(automation.error, t);
  const preparedError = translateSettingsError(prepareError, t);
  const usageData = usage.data;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[960px] px-5 py-5">
        <div className="mb-4 border-b border-border pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchSettings.platform")}</div>
          <h1 className="m-0 mt-1 text-[22px] font-semibold tracking-[0] text-text">{t("workbenchSettings.settings")}</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[8px] border border-border bg-bg-panel p-4 text-left">
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.language")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.languageDescription")}</div>
            <div className="mt-3 inline-flex rounded-[8px] border border-border bg-bg-elevated p-1">
              {([
                ["en", t("workbenchSettings.english")],
                ["zh-CN", t("workbenchSettings.simplifiedChinese")],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setLocale(value)}
                  className={`h-8 rounded-[6px] px-3 text-[12px] font-medium transition ${locale === value ? "bg-accent text-white" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onOpenModels}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover"
          >
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.models")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.modelsDescription")}</div>
          </button>
          <button
            onClick={onOpenSkills}
            disabled={skillsDisabled}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.skills")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.skillsDescription")}</div>
          </button>
          <button
            onClick={() => setSceneEditorOpen(true)}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover"
          >
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.customizeScenes")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.customizeScenesDescription")}</div>
          </button>
        </div>

        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchSettings.usage")}</div>
              <h2 className="m-0 mt-1 text-[15px] font-semibold text-text">{t("workbenchSettings.sceneVisibility")}</h2>
            </div>
            {usageData && <div className="text-[11px] text-text-dim">{new Date(usageData.generatedAt).toLocaleString(locale)}</div>}
          </div>

          <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
            {usage.status === "loading" && !usage.data && (
              <div className="p-4 text-[13px] text-text-muted">{t("workbenchSettings.loadingUsage")}</div>
            )}
            {usage.status === "error" && !usage.data && usageError && (
              <div className="border-b border-border p-4 text-[13px] text-text-muted">
                {usageError} <button onClick={usage.refresh} className="ml-2 underline">{t("common.retry")}</button>
              </div>
            )}
            {usageData && (
              <>
                <div className="grid grid-cols-4 border-b border-border max-[720px]:grid-cols-2">
                  {[
                    [t("workbenchSettings.totalWork"), usageData.totalRuns],
                    [t("workbenchSettings.sceneRuns"), usageData.sceneRuns],
                    [t("workbenchSettings.generalChats"), usageData.generalRuns],
                    [t("workbenchSettings.adoption"), formatPercent(usageData.sceneAdoptionRate)],
                  ].map(([label, value]) => (
                    <div key={label} className="border-r border-border p-4 last:border-r-0 max-[720px]:border-b max-[720px]:even:border-r-0">
                      <div className="text-[11px] text-text-dim">{label}</div>
                      <div className="mt-1 text-[22px] font-semibold tabular-nums text-text">{value}</div>
                    </div>
                  ))}
                </div>
                {usageData.byScene.length === 0 ? (
                  <div className="p-4 text-[13px] text-text-muted">{t("workbenchSettings.noSceneUsage")}</div>
                ) : (
                  <div className="divide-y divide-border">
                    {usageData.byScene.map((item) => {
                      const share = usageData.sceneRuns === 0 ? 0 : item.runs / usageData.sceneRuns;
                      return (
                        <div key={item.sceneId} className="grid grid-cols-[minmax(0,1fr)_92px_110px] items-center gap-3 px-4 py-3 max-[720px]:grid-cols-1">
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-[13px] font-medium text-text">{item.sceneName}</div>
                              <div className="shrink-0 text-[11px] text-text-dim">{formatPercent(share)}</div>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
                              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, share * 100)}%` }} />
                            </div>
                          </div>
                          <div className="text-[12px] text-text-muted">{t("workbenchSettings.runs", { count: item.runs })}</div>
                          <div className="text-[11px] text-text-dim">{new Date(item.lastUsedAt).toLocaleDateString(locale)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchSettings.automation")}</div>
            <h2 className="m-0 mt-1 text-[15px] font-semibold text-text">{t("workbenchSettings.manualOperationalHooks")}</h2>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
            <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
              {(() => {
                const automationList = automation.data ?? [];
                return (
                  <>
                    {automation.status === "loading" && automationList.length === 0 && (
                      <div className="p-4 text-[13px] text-text-muted">{t("workbenchSettings.loadingAutomation")}</div>
                    )}
                    {automation.status === "error" && automationList.length === 0 && automationError && (
                      <div className="p-4 text-[13px] text-text-muted">
                        {automationError} <button onClick={automation.refresh} className="ml-2 underline">{t("common.retry")}</button>
                      </div>
                    )}
                    {automation.status !== "loading" && automation.status !== "error" && automationList.length === 0 && (
                      <div className="p-4 text-[13px] text-text-muted">{t("workbenchSettings.noAutomationEntries")}</div>
                    )}
                    {preparedError && (
                      <div className="border-b border-border p-4 text-[13px] text-text-muted">{preparedError}</div>
                    )}
                    {automationList.map((entry) => (
                      <div key={entry.id} className="border-b border-border p-4 last:border-b-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[220px] flex-1">
                            <div className="text-[13px] font-semibold text-text">{entry.name}</div>
                            <div className="mt-1 text-[12px] leading-5 text-text-muted">{entry.description}</div>
                            <div className="mt-2 text-[11px] text-text-dim">{entry.cadenceLabel}</div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => onOpenSceneId(entry.sceneId)}
                              className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text"
                            >
                              {t("workbenchSettings.openScene")}
                            </button>
                            <button
                              onClick={() => handlePrepareRun(entry)}
                              disabled={!entry.enabled || runningId === entry.id}
                              className="h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {runningId === entry.id ? t("workbenchSettings.preparing") : t("workbenchSettings.prepareRun")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>

            <div className="rounded-[8px] border border-border bg-bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">{preparedRun?.automation.name ?? t("workbenchSettings.preparedRun")}</div>
                  <div className="mt-1 text-[12px] text-text-muted">{preparedRun ? t("workbenchSettings.promptReady") : t("workbenchSettings.selectAutomationEntry")}</div>
                </div>
                <button
                  onClick={handleCopyPrompt}
                  disabled={!preparedRun}
                  className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {copyState === "copied" ? t("common.copied") : copyState === "failed" ? t("common.failed") : t("workbenchSettings.copyPrompt")}
                </button>
              </div>
              <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[7px] border border-border bg-bg-subtle p-3 font-mono text-[11px] leading-5 text-text-muted">
                {preparedRun?.prompt ?? t("workbenchSettings.noRunPrepared")}
              </pre>
            </div>
          </div>
        </section>
      </div>
      {sceneEditorOpen && (
        <SceneConfigEditor
          scenes={scenes.data ?? []}
          onClose={() => {
            setSceneEditorOpen(false);
            invalidateControlResource("workbench:scenes");
          }}
        />
      )}
    </div>
  );
}
