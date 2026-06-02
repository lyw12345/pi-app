"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scene } from "@/lib/scenes";
import { useCachedResource, invalidateControlResource } from "@/hooks/useControlCollection";
import { useI18n } from "@/lib/i18n/provider";
import type { SceneOverrides } from "@/lib/scene-overrides";

interface Props {
  scenes: Scene[];
  onClose: () => void;
}

const DEFAULT_PROMPT_MAX = 16_000;
const OUTPUT_STYLE_MAX = 500;
const STARTERS_MAX = 8;
const STARTER_ITEM_MAX = 200;

interface SceneOverridesResponse {
  overrides?: Record<string, SceneOverrides>;
  error?: string;
}

const fetchOverrides = async (): Promise<Record<string, SceneOverrides>> => {
  const res = await fetch("/api/scene-overrides");
  const data = (await res.json()) as SceneOverridesResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `Failed to read overrides: ${res.status}`);
  }
  return data.overrides ?? {};
};

interface DraftState {
  defaultPrompt: string;
  outputStyle: string;
  suggestedStarters: string[];
}

function sceneToDraft(scene: Scene, override: SceneOverrides | undefined): DraftState {
  return {
    defaultPrompt: override?.defaultPrompt ?? scene.defaultPrompt,
    outputStyle: override?.outputStyle ?? scene.outputStyle,
    suggestedStarters: override?.suggestedStarters ?? scene.suggestedStarters.map((s) => s.prompt),
  };
}

function hasOverride(scene: Scene, override: SceneOverrides | undefined, draft: DraftState): boolean {
  if (!override) {
    return (
      draft.defaultPrompt !== scene.defaultPrompt ||
      draft.outputStyle !== scene.outputStyle ||
      !arraysEqual(draft.suggestedStarters, scene.suggestedStarters.map((s) => s.prompt))
    );
  }
  return (
    draft.defaultPrompt !== (override.defaultPrompt ?? scene.defaultPrompt) ||
    draft.outputStyle !== (override.outputStyle ?? scene.outputStyle) ||
    !arraysEqual(
      draft.suggestedStarters,
      override.suggestedStarters ?? scene.suggestedStarters.map((s) => s.prompt),
    )
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function SceneConfigEditor({ scenes, onClose }: Props) {
  const { t } = useI18n();
  const overrides = useCachedResource<Record<string, SceneOverrides>>(
    "workbench:scene-overrides",
    fetchOverrides,
    { staleMs: 15_000, retries: 1 },
  );
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ensureDraft = useCallback(
    (sceneId: string) => {
      if (drafts[sceneId]) return drafts[sceneId];
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) return null;
      const draft = sceneToDraft(scene, overrides.data?.[sceneId]);
      setDrafts((prev) => ({ ...prev, [sceneId]: draft }));
      return draft;
    },
    [drafts, overrides.data, scenes],
  );

  const updateDraft = (sceneId: string, next: Partial<DraftState>) => {
    setDrafts((prev) => {
      const current = prev[sceneId] ?? scenes.find((s) => s.id === sceneId);
      if (!current) return prev;
      const scene = scenes.find((s) => s.id === sceneId)!;
      const fallback: DraftState = sceneToDraft(scene, overrides.data?.[sceneId]);
      return { ...prev, [sceneId]: { ...fallback, ...current, ...next } };
    });
  };

  const handleSave = async (sceneId: string) => {
    const draft = drafts[sceneId];
    if (!draft) return;
    setSavingId(sceneId);
    setError(null);
    try {
      const res = await fetch(`/api/scene-overrides/${encodeURIComponent(sceneId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defaultPrompt: draft.defaultPrompt,
          outputStyle: draft.outputStyle,
          suggestedStarters: draft.suggestedStarters,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed: ${res.status}`);
      }
      invalidateControlResource("workbench:scene-overrides");
      invalidateControlResource("workbench:scenes");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleReset = async (sceneId: string) => {
    setSavingId(sceneId);
    setError(null);
    try {
      const res = await fetch(`/api/scene-overrides/${encodeURIComponent(sceneId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Reset failed: ${res.status}`);
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[sceneId];
        return next;
      });
      invalidateControlResource("workbench:scene-overrides");
      invalidateControlResource("workbench:scenes");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-[rgba(0,0,0,0.36)] px-4 py-8 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("sceneConfigEditor.ariaLabel")}
        className="flex max-h-[85vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[12px] border border-border bg-bg-popover"
        style={{ boxShadow: "var(--shadow-popover)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("sceneConfigEditor.settings")}</div>
            <h2 className="mt-1 text-[18px] font-semibold leading-snug text-text">{t("sceneConfigEditor.title")}</h2>
            <p className="mt-1 text-[12px] leading-5 text-text-muted">
              {t("sceneConfigEditor.description")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("sceneConfigEditor.close")}
            className="h-7 w-7 shrink-0 rounded-[6px] border border-border bg-bg-subtle text-[14px] text-text-muted hover:bg-bg-hover hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {overrides.status === "loading" && !overrides.data && (
            <div className="p-5 text-[13px] text-text-muted">{t("sceneConfigEditor.loadingOverrides")}</div>
          )}
          {error && (
            <div className="mx-5 mt-3 rounded-[6px] border border-[color-mix(in_srgb,#ef4444_55%,var(--border))] bg-[color-mix(in_srgb,#ef4444_10%,var(--bg-elevated))] px-3 py-2 text-[12px] text-[#b91c1c] dark:text-[#fca5a5]">
              {error}
            </div>
          )}
          {scenes.map((scene) => {
            const isOpen = expanded === scene.id;
            const override = overrides.data?.[scene.id];
            const draft = drafts[scene.id] ?? sceneToDraft(scene, override);
            const dirty = hasOverride(scene, override, draft);
            const isSaving = savingId === scene.id;
            return (
              <div key={scene.id} className="border-b border-border">
                <button
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-left hover:bg-bg-hover"
                  onClick={() => {
                    setExpanded(isOpen ? null : scene.id);
                    ensureDraft(scene.id);
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-[6px] border border-border bg-bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted">{scene.category}</span>
                      <span className="truncate text-[13px] font-semibold text-text">{scene.name}</span>
                      {override && (
                        <span className="rounded-[6px] border border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_15%,var(--bg-elevated))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{t("sceneConfigEditor.customized")}</span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-text-muted">{scene.description}</div>
                  </div>
                  <div className="text-[12px] text-text-dim">{isOpen ? "▾" : "▸"}</div>
                </button>
                {isOpen && (
                  <div className="space-y-4 bg-bg-subtle px-5 py-4">
                    <Field
                      label={t("sceneConfigEditor.defaultPrompt")}
                      hint={`${draft.defaultPrompt.length}/${DEFAULT_PROMPT_MAX}`}
                    >
                      <textarea
                        className="min-h-[120px] w-full resize-y rounded-[6px] border border-border bg-bg-elevated px-3 py-2 font-mono text-[12px] leading-5 text-text focus:border-accent focus:outline-none"
                        value={draft.defaultPrompt}
                        onChange={(e) => updateDraft(scene.id, { defaultPrompt: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={t("sceneConfigEditor.outputStyle")}
                      hint={`${draft.outputStyle.length}/${OUTPUT_STYLE_MAX}`}
                    >
                      <input
                        type="text"
                        className="h-9 w-full rounded-[6px] border border-border bg-bg-elevated px-3 text-[12px] text-text focus:border-accent focus:outline-none"
                        value={draft.outputStyle}
                        onChange={(e) => updateDraft(scene.id, { outputStyle: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={t("sceneConfigEditor.suggestedStarters")}
                      hint={`${draft.suggestedStarters.length}/${STARTERS_MAX}`}
                    >
                      <div className="space-y-2">
                        {draft.suggestedStarters.map((starter, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <input
                              type="text"
                              maxLength={STARTER_ITEM_MAX}
                              className="h-9 flex-1 rounded-[6px] border border-border bg-bg-elevated px-3 text-[12px] text-text focus:border-accent focus:outline-none"
                              value={starter}
                              onChange={(e) => {
                                const next = [...draft.suggestedStarters];
                                next[idx] = e.target.value;
                                updateDraft(scene.id, { suggestedStarters: next });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = draft.suggestedStarters.filter((_, i) => i !== idx);
                                updateDraft(scene.id, { suggestedStarters: next });
                              }}
                              className="h-9 shrink-0 rounded-[6px] border border-border bg-bg-elevated px-2.5 text-[11px] font-medium text-text-muted hover:bg-bg-hover hover:text-text"
                              aria-label={t("sceneConfigEditor.removeStarter", { index: idx + 1 })}
                            >
                              {t("common.remove")}
                            </button>
                          </div>
                        ))}
                        {draft.suggestedStarters.length < STARTERS_MAX && (
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft(scene.id, {
                                suggestedStarters: [...draft.suggestedStarters, ""],
                              })
                            }
                            className="h-8 rounded-[6px] border border-dashed border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text"
                          >
                            {t("sceneConfigEditor.addStarter")}
                          </button>
                        )}
                      </div>
                    </Field>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleReset(scene.id)}
                        disabled={!override || isSaving}
                        className="h-8 rounded-[6px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {t("sceneConfigEditor.resetToDefault")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(scene.id)}
                        disabled={!dirty || isSaving}
                        className="h-8 rounded-[6px] border border-transparent bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isSaving ? t("sceneConfigEditor.saving") : t("common.save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{label}</span>
        {hint && <span className="text-[11px] text-text-dim">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
