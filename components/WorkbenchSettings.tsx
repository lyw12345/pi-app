"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { cachePiWebPreferences } from "@/lib/pi-web-preferences-cache";
import type { PiWebPreferences } from "@/lib/pi-web-preferences";
import type { UsageDayBucket } from "@/lib/usage";
import { RemoteAccessSettings } from "./RemoteAccessSettings";
import { UsageActivityChart } from "./UsageActivityChart";

interface Props {
  onOpenModels: () => void;
  onOpenSkills: () => void;
  onAdvancedModeChange?: (enabled: boolean) => void;
  advancedMode?: boolean;
  skillsDisabled?: boolean;
  showSlashCommands?: boolean;
  onShowSlashCommandsChange?: (enabled: boolean) => void;
}

export function WorkbenchSettings({
  onOpenModels,
  onOpenSkills,
  onAdvancedModeChange,
  advancedMode = false,
  skillsDisabled,
  showSlashCommands = false,
  onShowSlashCommandsChange,
}: Props) {
  const { locale, setLocale, t } = useI18n();
  const [autoCompactionEnabled, setAutoCompactionEnabled] = useState(true);
  const [autoRetryEnabled, setAutoRetryEnabled] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [activityDays, setActivityDays] = useState<UsageDayBucket[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/preferences")
      .then((res) => res.json())
      .then((data: {
        preferences?: {
          autoCompactionEnabled?: boolean;
          autoRetryEnabled?: boolean;
          showSlashCommands?: boolean;
        };
      }) => {
        if (data.preferences) cachePiWebPreferences(data.preferences);
        setAutoCompactionEnabled(data.preferences?.autoCompactionEnabled !== false);
        setAutoRetryEnabled(data.preferences?.autoRetryEnabled !== false);
        if (onShowSlashCommandsChange && data.preferences?.showSlashCommands === true) {
          onShowSlashCommandsChange(true);
        }
      })
      .finally(() => setPrefsLoaded(true));
  }, [onShowSlashCommandsChange]);

  useEffect(() => {
    setActivityLoading(true);
    void fetch("/api/usage?days=7")
      .then((res) => res.json())
      .then((data: { timeline?: { days: UsageDayBucket[] } }) => {
        setActivityDays(data.timeline?.days ?? []);
      })
      .catch(() => setActivityDays([]))
      .finally(() => setActivityLoading(false));
  }, []);

  const updatePreference = async (patch: Record<string, boolean>) => {
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json() as { preferences?: PiWebPreferences };
    if (data.preferences) cachePiWebPreferences(data.preferences);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[960px] px-5 py-5">
        <div className="mb-4 border-b border-border pb-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchSettings.platform")}</div>
          <h1 className="m-0 mt-1 text-[22px] font-semibold tracking-[0] text-text">{t("workbenchSettings.settings")}</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[8px] border border-border bg-bg-panel p-4 text-left">
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.language")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.languageDescription")}</div>
            <div className="mt-3 inline-flex rounded-[8px] border border-border bg-bg-elevated p-1">
              {([
                ["en", t("workbenchSettings.english")],
                ["zh-CN", t("workbenchSettings.simplifiedChinese")],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setLocale(value)}
                  className={`h-8 rounded-[6px] px-3 text-[12px] font-medium transition ${locale === value ? "bg-accent text-white" : "text-text-muted hover:bg-bg-hover hover:text-text"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={onOpenModels}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover"
          >
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.models")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.modelsDescription")}</div>
          </button>
          <button
            onClick={onOpenSkills}
            disabled={skillsDisabled}
            className="rounded-[8px] border border-border bg-bg-panel p-4 text-left hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="text-[14px] font-semibold text-text">{t("workbenchSettings.skills")}</div>
            <div className="mt-2 text-[12px] leading-5 text-text-muted">{t("workbenchSettings.skillsDescription")}</div>
          </button>
        </div>

        <section className="mt-6">
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("settings.stabilityTitle")}</div>
          </div>
          <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
            <label className="flex items-start gap-3 border-b border-border px-4 py-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={autoCompactionEnabled}
                disabled={!prefsLoaded}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAutoCompactionEnabled(next);
                  void updatePreference({ autoCompactionEnabled: next });
                }}
              />
              <span>
                <span className="block text-[13px] font-medium text-text">{t("settings.autoCompaction")}</span>
                <span className="mt-1 block text-[12px] leading-5 text-text-muted">{t("settings.autoCompactionDescription")}</span>
              </span>
            </label>
            <label className="flex items-start gap-3 px-4 py-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={autoRetryEnabled}
                disabled={!prefsLoaded}
                onChange={(e) => {
                  const next = e.target.checked;
                  setAutoRetryEnabled(next);
                  void updatePreference({ autoRetryEnabled: next });
                }}
              />
              <span>
                <span className="block text-[13px] font-medium text-text">{t("settings.autoRetry")}</span>
                <span className="mt-1 block text-[12px] leading-5 text-text-muted">{t("settings.autoRetryDescription")}</span>
              </span>
            </label>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("settings.activityTitle")}</div>
          </div>
          <div className="rounded-[8px] border border-border bg-bg-panel px-4 py-4">
            <p className="m-0 text-[12px] leading-5 text-text-muted">{t("settings.activityDescription")}</p>
            <div className="mt-4">
              {activityLoading ? (
                <p className="m-0 text-[12px] text-text-muted">{t("settings.activityLoading")}</p>
              ) : (
                <UsageActivityChart
                  days={activityDays ?? []}
                  labels={{
                    started: t("settings.activityStarted"),
                    completed: t("settings.activityCompleted"),
                    active: t("settings.activityActive"),
                    empty: t("settings.activityEmpty"),
                  }}
                />
              )}
            </div>
          </div>
        </section>

        {onAdvancedModeChange ? (
          <section className="mt-6">
            <div className="overflow-hidden rounded-[8px] border border-border bg-bg-panel">
              <label className="flex items-start gap-3 border-b border-border px-4 py-4">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={advancedMode}
                  onChange={(e) => onAdvancedModeChange(e.target.checked)}
                />
                <span>
                  <span className="block text-[13px] font-medium text-text">{t("settings.advancedMode")}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-text-muted">{t("settings.advancedModeDescription")}</span>
                </span>
              </label>
              {advancedMode && onShowSlashCommandsChange ? (
                <label className="flex items-start gap-3 px-4 py-4">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={showSlashCommands}
                    disabled={!prefsLoaded}
                    onChange={(e) => {
                      const next = e.target.checked;
                      onShowSlashCommandsChange(next);
                      void updatePreference({ showSlashCommands: next });
                    }}
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-text">{t("settings.showSlashCommands")}</span>
                    <span className="mt-1 block text-[12px] leading-5 text-text-muted">{t("settings.showSlashCommandsDescription")}</span>
                  </span>
                </label>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0] text-text-dim">{t("workbenchSettings.about")}</div>
          </div>
          <div className="rounded-[8px] border border-border bg-bg-panel px-4 py-4 text-[12px] leading-6 text-text-muted">
            <p className="m-0">{t("workbenchSettings.aboutDescription")}</p>
            <p className="mb-0 mt-3 text-text">
              {t("workbenchSettings.piWebVersion")}{" "}
              <span className="font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}</span>
            </p>
            <p className="mb-0 mt-1 text-text">
              {t("workbenchSettings.piCodingAgentVersion")}{" "}
              <span className="font-mono">v{process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}</span>
            </p>
          </div>
        </section>

        <RemoteAccessSettings />
      </div>
    </div>
  );
}
