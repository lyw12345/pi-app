"use client";

import { useEffect, useState } from "react";
import type { AutomationEntry } from "@/lib/automation";
import type { UsageSummary } from "@/lib/usage";

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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function WorkbenchSettings({ onOpenModels, onOpenSkills, onOpenSceneId, skillsDisabled }: Props) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [automation, setAutomation] = useState<AutomationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [preparedRun, setPreparedRun] = useState<{ automation: AutomationEntry; prompt: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/usage").then((res) => res.json() as Promise<{ usage?: UsageSummary; error?: string }>),
      fetch("/api/automation").then((res) => res.json() as Promise<{ automation?: AutomationEntry[]; error?: string }>),
    ]).then(([usageData, automationData]) => {
      if (cancelled) return;
      if (usageData.error || automationData.error) {
        setError(usageData.error ?? automationData.error ?? "Unable to load platform data");
      }
      setUsage(usageData.usage ?? null);
      setAutomation(automationData.automation ?? []);
    }).catch((err) => {
      if (!cancelled) setError(String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handlePrepareRun = async (entry: AutomationEntry) => {
    setRunningId(entry.id);
    setCopyState("idle");
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: entry.id }),
      });
      const data = await res.json() as AutomationRunResponse;
      if (!res.ok || !data.automation || !data.prompt) {
        throw new Error(data.error ?? "Unable to prepare automation run");
      }
      setPreparedRun({ automation: data.automation, prompt: data.prompt });
    } catch (err) {
      setError(String(err));
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[960px] px-5 py-5">
        <div className="mb-4 border-b border-border pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">Platform</div>
          <h1 className="m-0 mt-1 text-[22px] font-semibold tracking-[0] text-text">Settings</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={onOpenModels}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover"
          >
            <div className="text-[14px] font-semibold text-text">Models</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">Provider keys, model list, defaults, and connection checks.</div>
          </button>
          <button
            onClick={onOpenSkills}
            disabled={skillsDisabled}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="text-[14px] font-semibold text-text">Skills</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">Runtime tools and installed capabilities for the selected workspace.</div>
          </button>
        </div>

        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">Usage</div>
              <h2 className="m-0 mt-1 text-[15px] font-semibold text-text">Scene visibility</h2>
            </div>
            {usage && <div className="text-[11px] text-text-dim">{new Date(usage.generatedAt).toLocaleString()}</div>}
          </div>

          <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
            {loading && <div className="p-4 text-[13px] text-text-muted">Loading usage...</div>}
            {!loading && error && <div className="border-b border-border p-4 text-[13px] text-text-muted">{error}</div>}
            {!loading && usage && (
              <>
                <div className="grid grid-cols-4 border-b border-border max-[720px]:grid-cols-2">
                  {[
                    ["Total work", usage.totalRuns],
                    ["Scene runs", usage.sceneRuns],
                    ["General chats", usage.generalRuns],
                    ["Adoption", formatPercent(usage.sceneAdoptionRate)],
                  ].map(([label, value]) => (
                    <div key={label} className="border-r border-border p-4 last:border-r-0 max-[720px]:border-b max-[720px]:even:border-r-0">
                      <div className="text-[11px] text-text-dim">{label}</div>
                      <div className="mt-1 text-[22px] font-semibold tabular-nums text-text">{value}</div>
                    </div>
                  ))}
                </div>
                {usage.byScene.length === 0 ? (
                  <div className="p-4 text-[13px] text-text-muted">No scene usage yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {usage.byScene.map((item) => {
                      const share = usage.sceneRuns === 0 ? 0 : item.runs / usage.sceneRuns;
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
                          <div className="text-[12px] text-text-muted">{item.runs} runs</div>
                          <div className="text-[11px] text-text-dim">{new Date(item.lastUsedAt).toLocaleDateString()}</div>
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
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">Automation</div>
            <h2 className="m-0 mt-1 text-[15px] font-semibold text-text">Manual operational hooks</h2>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
            <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
              {loading && <div className="p-4 text-[13px] text-text-muted">Loading automation...</div>}
              {!loading && automation.length === 0 && <div className="p-4 text-[13px] text-text-muted">No automation entries configured.</div>}
              {automation.map((entry) => (
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
                        Open scene
                      </button>
                      <button
                        onClick={() => handlePrepareRun(entry)}
                        disabled={!entry.enabled || runningId === entry.id}
                        className="h-8 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {runningId === entry.id ? "Preparing..." : "Prepare run"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[8px] border border-border bg-bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">{preparedRun?.automation.name ?? "Prepared run"}</div>
                  <div className="mt-1 text-[12px] text-text-muted">{preparedRun ? "Prompt is ready for scene execution." : "Select an automation entry."}</div>
                </div>
                <button
                  onClick={handleCopyPrompt}
                  disabled={!preparedRun}
                  className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {copyState === "copied" ? "Copied" : copyState === "failed" ? "Failed" : "Copy prompt"}
                </button>
              </div>
              <pre className="mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[7px] border border-border bg-bg-subtle p-3 font-mono text-[11px] leading-5 text-text-muted">
                {preparedRun?.prompt ?? "No run prepared."}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
