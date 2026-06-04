"use client";

import { useEffect, useState } from "react";
import { MessageView } from "./MessageView";
import { useI18n } from "@/lib/i18n/provider";
import type { AgentMessage } from "@/lib/types";

interface SharePayload {
  title: string;
  messages: AgentMessage[];
  entryIds: string[];
}

interface Props {
  token: string;
}

export function SharedConversationView({ token }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/share/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json() as SharePayload & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData({ title: body.title, messages: body.messages, entryIds: body.entryIds });
        setError(null);
      })
      .catch((err: unknown) => {
        setData(null);
        setError(err instanceof Error ? err.message : t("shareConversation.loadFailed"));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[13px] text-text-muted">
        {t("common.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-[13px] text-text-muted">
        {error ?? t("shareConversation.loadFailed")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg-elevated px-5 py-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("shareConversation.readOnly")}</p>
        <h1 className="m-0 mt-1 text-[18px] font-semibold text-text">{data.title}</h1>
      </header>
      <main className="mx-auto max-w-[820px] px-4 py-6">
        {data.messages.map((message, index) => (
          <MessageView
            key={data.entryIds[index] ?? index}
            message={message}
          />
        ))}
      </main>
    </div>
  );
}
