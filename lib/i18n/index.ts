import { en } from "./messages/en";
import { zhCN } from "./messages/zh-CN";

export const APP_LOCALES = ["en", "zh-CN"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const LOCALE_STORAGE_KEY = "pi-web.locale";

const messagesByLocale: Record<AppLocale, Record<string, unknown>> = {
  en,
  "zh-CN": zhCN,
};

const warnedMissingKeys = new Set<string>();

type Primitive = string | number | boolean | null | undefined;

export type TranslationKey = string;
export type TranslationParams = Record<string, Primitive>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "en" || value === "zh-CN";
}

export function normalizeLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  if (isAppLocale(value)) return value;
  const normalized = value.toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function resolveInitialLocale(
  storedLocale?: string | null,
  navigatorLanguage?: string | null,
  navigatorLanguages?: readonly string[] | null,
): AppLocale {
  const fromStorage = normalizeLocale(storedLocale);
  if (fromStorage) return fromStorage;
  return normalizeLocale(navigatorLanguages?.[0] ?? navigatorLanguage) ?? "en";
}

function readMessage(locale: AppLocale, key: TranslationKey): string | null {
  const path = key.split(".");
  let current: unknown = messagesByLocale[locale];
  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return null;
    }
    current = current[segment];
  }
  return typeof current === "string" ? current : null;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value == null ? `{${name}}` : String(value);
  });
}

function warnMissingKey(locale: AppLocale, key: TranslationKey): void {
  if (process.env.NODE_ENV === "production") return;
  const warningKey = `${locale}:${key}`;
  if (warnedMissingKeys.has(warningKey)) return;
  warnedMissingKeys.add(warningKey);
  console.warn(`Missing i18n key: ${key} (locale: ${locale})`);
}

export function translate(locale: AppLocale, key: TranslationKey, params?: TranslationParams): string {
  const current = readMessage(locale, key);
  if (current) return interpolate(current, params);
  warnMissingKey(locale, key);
  const fallback = readMessage("en", key);
  if (fallback) return interpolate(fallback, params);
  return key;
}

export function getMessages(locale: AppLocale): Record<string, unknown> {
  return messagesByLocale[locale];
}

export function resetI18nWarnings(): void {
  warnedMissingKeys.clear();
}
