"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

interface ScenePackChange {
  sceneId: string;
  action: "create" | "update" | "unchanged";
  fields: string[];
}

interface ImportPreviewResponse {
  preview?: boolean;
  changes?: ScenePackChange[];
  applied?: number;
  skipped?: number;
  error?: string;
}

export function ScenePackControls() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScenePackChange[] | null>(null);
  const [pendingPack, setPendingPack] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy("export");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/scene-overrides/export");
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "scenes.pi-scene-pack.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setSuccess(t("scenePack.exportSuccess"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleFileChosen = async (file: File) => {
    setBusy("import");
    setError(null);
    setSuccess(null);
    setPreview(null);
    setPendingPack(null);
    try {
      const text = await file.text();
      const pack = JSON.parse(text) as unknown;
      const res = await fetch("/api/scene-overrides/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack, preview: true }),
      });
      const data = (await res.json()) as ImportPreviewResponse;
      if (!res.ok) throw new Error(data.error ?? `Import preview failed (${res.status})`);
      setPreview(data.changes ?? []);
      setPendingPack(pack);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async () => {
    if (!pendingPack) return;
    setBusy("import");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/scene-overrides/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: pendingPack, apply: true }),
      });
      const data = (await res.json()) as ImportPreviewResponse;
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      setPreview(null);
      setPendingPack(null);
      setSuccess(t("scenePack.importApplied", { count: data.applied ?? 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("scenePack.title")}</div>
      <div className="rounded-[8px] border border-border bg-bg-panel px-4 py-4">
        <p className="m-0 text-[12px] leading-5 text-text-muted">{t("scenePack.description")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy !== null}
            className="rounded-[6px] border border-border bg-bg-elevated px-3 py-2 text-[12px] font-medium text-text hover:bg-bg-hover disabled:opacity-50"
          >
            {busy === "export" ? t("scenePack.exporting") : t("scenePack.export")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
            className="rounded-[6px] border border-border bg-bg-elevated px-3 py-2 text-[12px] font-medium text-text hover:bg-bg-hover disabled:opacity-50"
          >
            {busy === "import" ? t("scenePack.importing") : t("scenePack.import")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.pi-scene-pack.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFileChosen(file);
            }}
          />
        </div>

        {preview && preview.length > 0 ? (
          <div className="mt-4 rounded-[6px] border border-border bg-bg-elevated p-3">
            <div className="text-[12px] font-medium text-text">{t("scenePack.previewTitle")}</div>
            <ul className="m-0 mt-2 list-none space-y-1 p-0 text-[11px] text-text-muted">
              {preview.map((change) => (
                <li key={change.sceneId}>
                  {change.sceneId}: {t(`scenePack.action.${change.action}`)} ({change.fields.join(", ")})
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={busy !== null}
                className="rounded-[6px] bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {t("scenePack.confirmImport")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPendingPack(null);
                }}
                className="rounded-[6px] border border-border px-3 py-1.5 text-[12px] text-text-muted hover:bg-bg-hover"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mb-0 mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p> : null}
        {success ? <p className="mb-0 mt-3 text-[12px] text-emerald-700 dark:text-emerald-400">{success}</p> : null}
      </div>
    </section>
  );
}
