"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import type { UsageDayBucket } from "@/lib/usage";
import { RemoteAccessSettings } from "./RemoteAccessSettings";
import { UsageActivityChart } from "./UsageActivityChart";
import { ExtensionsSettings } from "./ExtensionsSettings";
import { ScenePackControls } from "./ScenePackControls";
import { PowerManagementSettings } from "./PowerManagementSettings";

interface Props {
  onOpenModels: () => void;
  onOpenSkills: () => void;
  skillsDisabled?: boolean;
}

export function WorkbenchSettings({
  onOpenModels,
  onOpenSkills,
  skillsDisabled,
}: Props) {
  const { locale, setLocale, t } = useI18n();
  const [activityDays, setActivityDays] = useState<UsageDayBucket[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

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

        <ExtensionsSettings />
        <ScenePackControls />

        <PowerManagementSettings />

        <RemoteAccessSettings />
      </div>
    </div>
  );
}
