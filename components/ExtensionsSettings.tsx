"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface ExtensionListItem {
  path: string;
  resolvedPath: string;
  displayName: string;
  enabled: boolean;
  source: string;
  scope?: string;
  commands: Array<{ name: string; description?: string }>;
  loadError?: string;
}

interface ExtensionsResponse {
  extensions?: ExtensionListItem[];
  errors?: Array<{ path: string; error: string }>;
  error?: string;
}

export function ExtensionsSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ExtensionListItem[]>([]);
  const [globalErrors, setGlobalErrors] = useState<Array<{ path: string; error: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extensions", { cache: "no-store" });
      const data = (await res.json()) as ExtensionsResponse;
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems(data.extensions ?? []);
      setGlobalErrors(data.errors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
      setGlobalErrors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("extensionsSettings.title")}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-[12px] text-accent hover:underline"
        >
          {t("common.retry")}
        </button>
      </div>
      <div className="rounded-[8px] border border-border bg-bg-panel px-4 py-4">
        <p className="m-0 text-[12px] leading-5 text-text-muted">{t("extensionsSettings.description")}</p>
        {loading ? (
          <p className="mb-0 mt-3 text-[12px] text-text-muted">{t("common.loading")}</p>
        ) : error ? (
          <p className="mb-0 mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p>
        ) : items.length === 0 ? (
          <p className="mb-0 mt-3 text-[12px] text-text-muted">{t("extensionsSettings.empty")}</p>
        ) : (
          <ul className="m-0 mt-3 list-none space-y-3 p-0">
            {items.map((item) => (
              <li key={item.resolvedPath} className="rounded-[6px] border border-border bg-bg-elevated px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-text">{item.displayName}</span>
                  <span className="rounded-[4px] bg-bg-hover px-1.5 py-0.5 text-[10px] uppercase text-text-dim">
                    {item.enabled ? t("extensionsSettings.enabled") : t("extensionsSettings.disabled")}
                  </span>
                  <span className="text-[10px] text-text-dim">{item.source}{item.scope ? ` · ${item.scope}` : ""}</span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-text-muted break-all">{item.path}</div>
                {item.commands.length > 0 ? (
                  <div className="mt-2 text-[11px] text-text-muted">
                    {t("extensionsSettings.commands")}: {item.commands.map((command) => `/${command.name}`).join(", ")}
                  </div>
                ) : null}
                {item.loadError ? (
                  <div className="mt-2 text-[11px] text-red-600 dark:text-red-400">{item.loadError}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {globalErrors.length > 0 ? (
          <div className="mt-3 text-[11px] text-red-600 dark:text-red-400">
            {globalErrors.map((entry) => (
              <div key={entry.path}>{entry.path}: {entry.error}</div>
            ))}
          </div>
        ) : null}
        <p className="mb-0 mt-4 text-[11px] leading-5 text-text-dim">
          {t("extensionsSettings.restartHint")}{" "}
          <a
            href="https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            {t("extensionsSettings.docsLink")}
          </a>
        </p>
      </div>
    </section>
  );
}
