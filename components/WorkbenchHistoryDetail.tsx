"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { ProductHistoryItem, ProductSessionStatus } from "@/lib/scenes";

interface Props {
  item: ProductHistoryItem;
  onClose: () => void;
  onOpenChat: (item: ProductHistoryItem) => void;
}

const STATUS_CLASS: Record<ProductSessionStatus, string> = {
  active: "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] text-accent",
  completed: "border-[color-mix(in_srgb,#22c55e_55%,var(--border))] text-[#15803d] dark:text-[#4ade80]",
  draft: "border-border text-text-dim",
};

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

export function WorkbenchHistoryDetail({ item, onClose, onOpenChat }: Props) {
  const { t, locale } = useI18n();
  const statusLabel: Record<ProductSessionStatus, string> = {
    active: t("workbenchHistoryDetail.active"),
    completed: t("workbenchHistoryDetail.completed"),
    draft: t("workbenchHistoryDetail.draft"),
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        aria-label={t("workbenchHistoryDetail.historyDetails")}
        className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[12px] border border-border bg-bg-popover"
        style={{ boxShadow: "var(--shadow-popover)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-[6px] border border-border bg-bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-muted">
                {item.sceneId ? t("workbenchHistoryDetail.scene") : t("workbenchHistoryDetail.general")}
              </span>
              <span className="truncate text-[12px] text-text-dim">{item.sceneName}</span>
            </div>
            <h2 className="mt-1.5 truncate text-[18px] font-semibold leading-snug text-text" title={item.title}>
              {item.title}
            </h2>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-text-dim">
              <span className={`rounded-[6px] border bg-bg-subtle px-2 py-0.5 font-medium ${STATUS_CLASS[item.status]}`}>
                {statusLabel[item.status]}
              </span>
              <span>·</span>
              <span>
                {item.messageCount === 1
                  ? t("workbenchHistoryDetail.messagesCountOne", { count: item.messageCount })
                  : t("workbenchHistoryDetail.messagesCountOther", { count: item.messageCount })}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("workbenchHistoryDetail.closeDetails")}
            className="h-7 w-7 shrink-0 rounded-[6px] border border-border bg-bg-subtle text-[14px] text-text-muted hover:bg-bg-hover hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {item.summary ? (
            <div className="mb-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("workbenchHistoryDetail.latestResultSummary")}</div>
              <div
                className="whitespace-pre-wrap rounded-[8px] border border-border bg-bg-subtle px-3 py-2.5 text-[13px] leading-6 text-text"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {item.summary}
              </div>
            </div>
          ) : (
            <div className="mb-4 text-[12px] text-text-dim">{t("workbenchHistoryDetail.noSummary")}</div>
          )}

          {item.firstMessage && (
            <div className="mb-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("workbenchHistoryDetail.firstMessage")}</div>
              <div className="whitespace-pre-wrap rounded-[8px] border border-border bg-bg-subtle px-3 py-2.5 text-[13px] leading-6 text-text-muted">
                {item.firstMessage}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("workbenchHistoryDetail.started")}</div>
              <div className="text-text-muted">{formatDate(item.startedAt, locale)}</div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("workbenchHistoryDetail.lastUpdated")}</div>
              <div className="text-text-muted">{formatDate(item.updatedAt, locale)}</div>
            </div>
            <div className="col-span-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("workbenchHistoryDetail.workingDirectory")}</div>
              <div className="truncate font-mono text-[12px] text-text-muted" title={item.cwd}>{item.cwd}</div>
            </div>
            <div className="col-span-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-dim">{t("workbenchHistoryDetail.sessionFile")}</div>
              <div className="truncate font-mono text-[12px] text-text-muted" title={item.path}>{item.path}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-panel px-5 py-3">
          <button
            onClick={onClose}
            className="h-8 rounded-[7px] border border-border bg-bg-elevated px-3 text-[12px] font-medium text-text-muted hover:bg-bg-hover hover:text-text"
          >
            {t("workbenchHistoryDetail.close")}
          </button>
          <button
            onClick={() => onOpenChat(item)}
            className="h-8 rounded-[7px] border border-transparent bg-accent px-3 text-[12px] font-semibold text-white hover:bg-accent-hover"
          >
            {t("workbenchHistoryDetail.openChat")}
          </button>
        </div>
      </div>
    </div>
  );
}
