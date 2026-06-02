"use client";

import { LocaleProvider } from "@/lib/i18n/provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
