"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  resolveInitialLocale,
  translate,
  type AppLocale,
  type TranslationKey,
  type TranslationParams,
} from "./index";

interface I18nContextValue {
  locale: AppLocale;
  setLocale: (nextLocale: AppLocale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readClientLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  const fromDocument = normalizeLocale(document.documentElement.lang);
  if (fromDocument) return fromDocument;
  let storedLocale: string | null = null;
  try {
    storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    storedLocale = null;
  }
  return resolveInitialLocale(storedLocale, window.navigator.language, window.navigator.languages);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  useEffect(() => {
    setLocaleState(readClientLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
    }
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback((key: TranslationKey, params?: TranslationParams) => {
    return translate(locale, key, params);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return context;
}
