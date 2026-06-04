"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface Props {
  sessionId: string;
  isStreaming: boolean;
  onClose: () => void;
}

export function ShareConversationModal({ sessionId, isStreaming, onClose }: Props) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadLink = useCallback(async () => {
    if (isStreaming) {
      setError(t("chatInput.exportHtmlStreaming"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/share`, {
        method: "POST",
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? t("shareConversation.createFailed"));
      }
      setUrl(data.url);
    } catch (err) {
      setUrl(null);
      setError(err instanceof Error ? err.message : t("shareConversation.createFailed"));
    } finally {
      setLoading(false);
    }
  }, [isStreaming, sessionId, t]);

  useEffect(() => {
    void loadLink();
  }, [loadLink]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("shareConversation.copyFailed"));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[480px] rounded-[10px] border border-border bg-[var(--bg-popover)] p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-conversation-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="share-conversation-title" className="m-0 text-[16px] font-semibold text-text">
              {t("shareConversation.title")}
            </h2>
            <p className="m-0 mt-1 text-[12px] leading-5 text-text-muted">{t("shareConversation.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[12px] text-text-muted hover:text-text">
            {t("common.close")}
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="m-0 text-[12px] text-text-muted">{t("shareConversation.generating")}</p>
          ) : url ? (
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={url}
                className="min-w-0 flex-1 rounded-[6px] border border-border bg-bg-panel px-3 py-2 font-mono text-[11px] text-text"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="shrink-0 rounded-[6px] bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover"
              >
                {copied ? t("shareConversation.copied") : t("shareConversation.copyLink")}
              </button>
            </div>
          ) : null}
          <p className="mb-0 mt-3 text-[11px] leading-5 text-text-dim">{t("shareConversation.hint")}</p>
        </div>

        {error ? <p className="mb-0 mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
