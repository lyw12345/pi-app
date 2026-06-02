"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { ProductHistoryItem } from "@/lib/scenes";
import { WorkbenchHistoryDetail } from "./WorkbenchHistoryDetail";

interface Props {
  onOpenHistory: (item: ProductHistoryItem) => void;
}

export function WorkbenchHistory({ onOpenHistory }: Props) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<ProductHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState<ProductHistoryItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/history")
      .then((res) => res.json() as Promise<{ history: ProductHistoryItem[] }>)
      .then((data) => {
        if (!cancelled) setItems(data.history ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[980px] px-5 py-5">
        <div className="mb-4 border-b border-border pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchHistory.workbench")}</div>
          <h1 className="m-0 mt-1 text-[22px] font-semibold tracking-[0] text-text">{t("workbenchHistory.myWork")}</h1>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
          {loading && <div className="p-4 text-[13px] text-text-muted">{t("workbenchHistory.loadingHistory")}</div>}
          {!loading && items.length === 0 && <div className="p-4 text-[13px] text-text-muted">{t("workbenchHistory.noWorkFound")}</div>}
          {items.map((item) => (
            <div
              key={item.sessionId}
              className="group grid w-full grid-cols-[minmax(0,1fr)_150px_96px_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-bg-hover max-[720px]:grid-cols-[minmax(0,1fr)_auto]"
            >
              <button
                onClick={() => onOpenHistory(item)}
                className="min-w-0 text-left"
              >
                <div className="truncate text-[13px] font-semibold text-text">{item.title}</div>
                <div className="mt-1 truncate text-[12px] text-text-muted">{item.summary}</div>
              </button>
              <div className="text-[12px] text-text-muted max-[720px]:hidden">{item.sceneName}</div>
              <div className="text-[11px] text-text-dim max-[720px]:hidden">{new Date(item.updatedAt).toLocaleString(locale)}</div>
              <button
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
          ))}
        </div>
      </div>
      {detailItem && (
        <WorkbenchHistoryDetail
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onOpenChat={(item) => {
            setDetailItem(null);
            onOpenHistory(item);
          }}
        />
      )}
    </div>
  );
}
