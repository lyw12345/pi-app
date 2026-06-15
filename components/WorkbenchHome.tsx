"use client";

import { useMemo, useState } from "react";
import { useCachedResource, invalidateControlResource } from "@/hooks/useControlCollection";
import { useI18n } from "@/lib/i18n/provider";
import { fetchWithTimeout } from "@/lib/api-fetch";
import type { ProductHistoryItem } from "@/lib/product-history";
import { WorkbenchHistoryDetail } from "./WorkbenchHistoryDetail";

interface Props {
  onStartChat: () => void;
  onOpenHistory: (item: ProductHistoryItem) => void;
  startingChat?: boolean;
  startChatError?: string | null;
  sessionRestoreNotice?: string | null;
}

interface HistoryResponse {
  history?: ProductHistoryItem[];
  error?: string;
}

const RECENT_LIMIT = 5;

const fetchRecentHistory = async (): Promise<ProductHistoryItem[]> => {
  const res = await fetchWithTimeout("/api/history", { cache: "no-store" });
  const data = (await res.json()) as HistoryResponse;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  if (data.error) throw new Error(data.error);
  return data.history ?? [];
};

export function WorkbenchHome({
  onStartChat,
  onOpenHistory,
  startingChat,
  startChatError,
  sessionRestoreNotice,
}: Props) {
  const { t, locale } = useI18n();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [detailItem, setDetailItem] = useState<ProductHistoryItem | null>(null);
  const history = useCachedResource<ProductHistoryItem[]>(
    "workbench:history:recent",
    fetchRecentHistory,
    { staleMs: 15_000, retries: 1 },
  );

  const items = useMemo(() => history.data ?? [], [history.data]);
  const visibleItems = useMemo(
    () => (showAllHistory ? items : items.slice(0, RECENT_LIMIT)),
    [items, showAllHistory],
  );

  const handleOpenHistory = (item: ProductHistoryItem) => {
    invalidateControlResource("workbench:history:recent");
    onOpenHistory(item);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 py-5">
        <div className="border-b border-border pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchHome.enterpriseWorkbench")}</div>
            <h1 className="m-0 mt-1 text-[24px] font-semibold leading-tight tracking-[0] text-text">{t("workbenchHome.title")}</h1>
            <p className="m-0 mt-2 max-w-[640px] text-[13px] leading-6 text-text-muted">{t("workbenchHome.description")}</p>
          </div>
        </div>

        {sessionRestoreNotice ? (
          <p className="m-0 max-w-[640px] text-[13px] text-amber-700 dark:text-amber-400">
            {sessionRestoreNotice}
          </p>
        ) : null}
        {startChatError ? (
          <p className="m-0 max-w-[640px] text-[13px] text-red-600 dark:text-red-400">
            {t("workbenchHome.startChatError", { error: startChatError })}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onStartChat}
          disabled={startingChat}
          className="flex w-full max-w-[320px] items-center justify-center rounded-[8px] bg-accent px-4 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {startingChat ? t("workbenchHome.startingChat") : t("workbenchHome.newChat")}
        </button>

        <section className="mt-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="m-0 text-[14px] font-semibold text-text">{t("workbenchHome.myWork")}</h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-dim">{t("workbenchHome.recentWorkDescription")}</span>
              {items.length > RECENT_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setShowAllHistory((value) => !value)}
                  className="text-[11px] font-medium text-accent hover:underline"
                >
                  {showAllHistory ? t("workbenchHome.showLessHistory") : t("workbenchHome.viewAllHistory")}
                </button>
              ) : null}
            </div>
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
            {history.status === "loading" && items.length === 0 ? (
              <div className="p-4 text-[13px] text-text-muted">{t("workbenchHistory.loadingHistory")}</div>
            ) : null}
            {history.status !== "loading" && items.length === 0 ? (
              <div className="p-4 text-[13px] text-text-muted">
                {history.error
                  ? t("workbenchHome.recentWorkError", { error: history.error })
                  : t("workbenchHome.noRecentWork")}
              </div>
            ) : null}
            {visibleItems.map((item) => (
              showAllHistory ? (
                <div
                  key={item.sessionId}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_150px_120px_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-bg-hover max-[720px]:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenHistory(item)}
                    className="min-w-0 text-left"
                    title={item.cwd}
                  >
                    <div className="truncate text-[13px] font-semibold text-text">{item.title}</div>
                    <div className="mt-1 truncate text-[12px] text-text-muted">{item.summary}</div>
                  </button>
                  <div
                    className="truncate text-[12px] text-text-muted max-[720px]:hidden"
                    title={item.cwd}
                    aria-label={t("workbenchHistory.projectName")}
                  >
                    {item.projectName}
                  </div>
                  <div className="text-[11px] text-text-dim max-[720px]:hidden">{new Date(item.updatedAt).toLocaleString(locale)}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailItem(item);
                    }}
                    className="h-7 shrink-0 rounded-[6px] border border-border bg-bg-subtle px-2.5 text-[11px] font-medium text-text-muted opacity-0 transition-opacity hover:bg-bg-hover hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
                    title={t("workbenchHistory.showDetails")}
                    aria-label={t("workbenchHistory.showDetails")}
                  >
                    {t("workbenchHistory.details")}
                  </button>
                </div>
              ) : (
                <button
                  key={item.sessionId}
                  type="button"
                  onClick={() => handleOpenHistory(item)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-bg-hover"
                  title={item.cwd}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text">{item.title}</div>
                    <div className="mt-1 truncate text-[12px] text-text-muted">{item.summary}</div>
                  </div>
                  <div
                    className="shrink-0 truncate text-[12px] text-text-muted"
                    style={{ maxWidth: "160px" }}
                    aria-label={t("workbenchHome.projectName")}
                  >
                    {item.projectName}
                  </div>
                  <div className="shrink-0 text-[11px] text-text-dim">{new Date(item.updatedAt).toLocaleDateString(locale)}</div>
                </button>
              )
            ))}
          </div>
        </section>
      </div>
      {detailItem ? (
        <WorkbenchHistoryDetail
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onOpenChat={(item) => {
            setDetailItem(null);
            handleOpenHistory(item);
          }}
        />
      ) : null}
    </div>
  );
}
