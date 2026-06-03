"use client";

import { useMemo } from "react";
import { useCachedResource, invalidateControlResource } from "@/hooks/useControlCollection";
import { useI18n } from "@/lib/i18n/provider";
import { fetchWithTimeout } from "@/lib/api-fetch";
import { summarizeOutputStyle, type ProductHistoryItem, type Scene } from "@/lib/scenes";

interface Props {
  onOpenScene: (scene: Scene) => void;
  onOpenHistory: (item: ProductHistoryItem) => void;
  launchingSceneId?: string | null;
  onEnterAdvancedMode?: () => void;
}

interface ScenesResponse {
  scenes?: Scene[];
  error?: string;
}

interface HistoryResponse {
  history?: ProductHistoryItem[];
  error?: string;
}

const fetchScenes = async (): Promise<Scene[]> => {
  const res = await fetchWithTimeout("/api/scenes", { cache: "no-store" });
  const data = (await res.json()) as ScenesResponse;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data.scenes ?? [];
};

const fetchRecentHistory = async (): Promise<ProductHistoryItem[]> => {
  const res = await fetchWithTimeout("/api/history", { cache: "no-store" });
  const data = (await res.json()) as HistoryResponse;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data.history ?? [];
};

export function WorkbenchHome({ onOpenScene, onOpenHistory, launchingSceneId, onEnterAdvancedMode }: Props) {
  const { t, locale } = useI18n();
  const scenes = useCachedResource<Scene[]>("workbench:scenes", fetchScenes, {
    staleMs: 15_000,
    retries: 1,
  });
  const history = useCachedResource<ProductHistoryItem[]>(
    "workbench:history:recent",
    fetchRecentHistory,
    { staleMs: 15_000, retries: 1 },
  );

  const recent = useMemo(
    () => (history.data ?? []).slice(0, 5),
    [history.data],
  );

  const handleOpenScene = (scene: Scene) => {
    // Pre-emptively invalidate so a launch doesn't show stale history after returning.
    invalidateControlResource("workbench:history:recent");
    onOpenScene(scene);
  };

  const handleOpenHistory = (item: ProductHistoryItem) => {
    invalidateControlResource("workbench:history:recent");
    onOpenHistory(item);
  };

  const sceneList = scenes.data ?? [];
  const showScenesLoading = scenes.status === "loading" && sceneList.length === 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 py-5">
        <div className="border-b border-border pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchHome.enterpriseWorkbench")}</div>
            <h1 className="m-0 mt-1 text-[24px] font-semibold leading-tight tracking-[0] text-text">{t("workbenchHome.scenes")}</h1>
          </div>
        </div>

        {showScenesLoading ? (
          <div className="rounded-[8px] border border-border bg-bg-panel p-4 text-[13px] text-text-muted">{t("workbenchHome.loadingScenes")}</div>
        ) : scenes.error ? (
          <div className="rounded-[8px] border border-border bg-bg-panel p-4 text-[13px] text-text-muted">
            {scenes.error} <button onClick={scenes.refresh} className="ml-2 underline">{t("common.retry")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {sceneList.map((scene) => (
              <button
                key={scene.id}
                onClick={() => handleOpenScene(scene)}
                className="group flex min-h-[190px] flex-col items-start rounded-[8px] border border-border bg-bg-panel p-4 text-left transition hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] hover:bg-bg-elevated"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="rounded-[6px] border border-border bg-bg-subtle px-2 py-1 text-[11px] font-medium text-text-muted">{scene.category}</span>
                  <span className="text-[11px] text-text-dim">{t("workbenchHome.startersCount", { count: scene.suggestedStarters.length })}</span>
                </div>
                <div className="mt-4 text-[17px] font-semibold leading-snug text-text">{scene.name}</div>
                <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-text-muted">{scene.description}</div>
                <div className="mt-auto flex w-full items-center justify-between pt-4">
                  <span className="text-[12px] text-text-dim">{summarizeOutputStyle(scene.outputStyle)}</span>
                  <span className="rounded-[7px] bg-accent px-3 py-1.5 text-[12px] font-semibold text-white">
                    {launchingSceneId === scene.id ? t("workbenchHome.opening") : t("workbenchHome.open")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        <section className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="m-0 text-[14px] font-semibold text-text">{t("workbenchHome.myWork")}</h2>
            <span className="text-[11px] text-text-dim">{t("workbenchHome.recentWorkDescription")}</span>
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
            {recent.length === 0 ? (
              <div className="p-4 text-[13px] text-text-muted">
                {history.error
                  ? t("workbenchHome.recentWorkError", { error: history.error })
                  : t("workbenchHome.noRecentWork")}
              </div>
            ) : (
              recent.map((item) => (
                <button
                  key={item.sessionId}
                  onClick={() => handleOpenHistory(item)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text">{item.title}</div>
                    <div className="mt-1 truncate text-[12px] text-text-muted">{item.sceneName} · {item.summary}</div>
                  </div>
                  <div className="shrink-0 text-[11px] text-text-dim">{new Date(item.updatedAt).toLocaleDateString(locale)}</div>
                </button>
              ))
            )}
          </div>
        </section>
        {onEnterAdvancedMode && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onEnterAdvancedMode}
              className="text-[12px] text-text-dim underline hover:text-text-muted"
            >
              {t("settings.advancedMode")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
