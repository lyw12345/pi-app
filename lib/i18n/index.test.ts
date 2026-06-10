import { afterEach, describe, expect, it, vi } from "vitest";
import { zhCN } from "./messages/zh-CN";
import {
  normalizeLocale,
  resetI18nWarnings,
  resolveInitialLocale,
  translate,
  type TranslationKey,
} from "./index";

describe("i18n locale resolution", () => {
  it("prefers a valid stored locale over browser locale", () => {
    expect(resolveInitialLocale("zh-CN", "en-US", ["en-US"])).toBe("zh-CN");
  });

  it("maps zh browser locales to zh-CN", () => {
    expect(resolveInitialLocale(null, "zh-TW", ["zh-TW", "en-US"])).toBe("zh-CN");
  });

  it("maps en browser locales to en", () => {
    expect(resolveInitialLocale(null, "en-US", ["en-US"])).toBe("en");
  });

  it("ignores invalid storage values and falls back to the browser locale", () => {
    expect(resolveInitialLocale("fr", "zh-CN", ["zh-CN"])).toBe("zh-CN");
  });

  it("falls back to en when neither storage nor browser locale is supported", () => {
    expect(resolveInitialLocale(null, "fr-FR", ["fr-FR"])).toBe("en");
  });

  it("normalizes explicit locale strings", () => {
    expect(normalizeLocale("en-GB")).toBe("en");
    expect(normalizeLocale("zh-Hans")).toBe("zh-CN");
    expect(normalizeLocale("fr")).toBeNull();
  });
});

describe("i18n translation lookup", () => {
  afterEach(() => {
    resetI18nWarnings();
    vi.restoreAllMocks();
  });

  it("returns the current locale string when present", () => {
    expect(translate("zh-CN", "workbenchSettings.settings")).toBe("设置");
  });

  it("exposes model configuration copy in both locales", () => {
    expect(translate("en", "accounts.configureModels")).toBe("Configure models");
    expect(translate("zh-CN", "accounts.configureModels")).toBe("配置模型");
    expect(translate("en", "modelsConfig.perSessionModelHint")).toContain("selector");
    expect(translate("zh-CN", "modelsConfig.perSessionModelHint")).toContain("模型选择器");
  });

  it("interpolates named params", () => {
    expect(translate("zh-CN", "sessionSidebar.newSessionIn", { cwd: "/tmp/demo" })).toBe("在 /tmp/demo 中新建会话");
  });

  it("falls back to English when the current locale key is missing", () => {
    vi.stubEnv("NODE_ENV", "test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const original = zhCN.modelsConfig.callbackPlaceholder;
    const mutableModelsConfig = zhCN.modelsConfig as Record<string, string>;

    Reflect.deleteProperty(mutableModelsConfig, "callbackPlaceholder");

    expect(translate("zh-CN", "modelsConfig.callbackPlaceholder")).toBe("http://localhost:1455/auth/callback?code=...");
    expect(warn).toHaveBeenCalledTimes(1);

    mutableModelsConfig.callbackPlaceholder = original;
    vi.unstubAllEnvs();
  });

  it("returns the key when both locales are missing", () => {
    vi.stubEnv("NODE_ENV", "test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unknownKey = "workbenchSettings.notARealKey" as TranslationKey;

    expect(translate("en", unknownKey)).toBe(unknownKey);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("warns only once per missing key and locale pair", () => {
    vi.stubEnv("NODE_ENV", "test");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unknownKey = "workbenchSettings.notARealKey" as TranslationKey;

    translate("zh-CN", unknownKey);
    translate("zh-CN", unknownKey);
    translate("en", unknownKey);

    expect(warn).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});
