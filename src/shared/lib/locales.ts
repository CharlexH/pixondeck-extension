export type LocaleTier = "P0" | "P1" | "P2";

export interface LocaleConfig {
  code: string;
  name: string;
  localName: string;
  tier: LocaleTier;
  dir: "ltr" | "rtl";
  enabled: boolean;
  noindex?: boolean;
}

export const LOCALES: LocaleConfig[] = [
  // Display order: English, European languages, then Japanese, Korean and Chinese.
  {
    code: "en",
    name: "English",
    localName: "English",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "es",
    name: "Spanish",
    localName: "Español",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "de",
    name: "German",
    localName: "Deutsch",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "fr",
    name: "French",
    localName: "Français",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "pt-BR",
    name: "Portuguese (Brazil)",
    localName: "Português (Brasil)",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "it",
    name: "Italian",
    localName: "Italiano",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "pl",
    name: "Polish",
    localName: "Polski",
    tier: "P1",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "ja",
    name: "Japanese",
    localName: "日本語",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "ko",
    name: "Korean",
    localName: "한국어",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "zh-TW",
    name: "Chinese (Traditional)",
    localName: "繁體中文",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },
  {
    code: "zh-CN",
    name: "Chinese (Simplified)",
    localName: "简体中文",
    tier: "P0",
    dir: "ltr",
    enabled: true,
  },

  // Languages not yet enabled.
  {
    code: "vi",
    name: "Vietnamese",
    localName: "Tiếng Việt",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "th",
    name: "Thai",
    localName: "ไทย",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "id",
    name: "Indonesian",
    localName: "Bahasa Indonesia",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "ms",
    name: "Malay",
    localName: "Bahasa Melayu",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "nl",
    name: "Dutch",
    localName: "Nederlands",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "ru",
    name: "Russian",
    localName: "Русский",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "uk",
    name: "Ukrainian",
    localName: "Українська",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "sv",
    name: "Swedish",
    localName: "Svenska",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
  {
    code: "tr",
    name: "Turkish",
    localName: "Türkçe",
    tier: "P1",
    dir: "ltr",
    enabled: false,
  },
];

export const DEFAULT_LOCALE = "en";

export const ENABLED_LOCALES = LOCALES.filter((l) => l.enabled).map(
  (l) => l.code,
);
// Every enabled language participates in public search acquisition.
// Route-level exclusions still protect private, auth and nonexistent content.
export const INDEXABLE_LOCALES: readonly string[] = [...ENABLED_LOCALES];
export const P0_LOCALES = LOCALES.filter(
  (l) => l.tier === "P0" && l.enabled,
).map((l) => l.code);

export function getLocaleConfig(code: string): LocaleConfig {
  return LOCALES.find((l) => l.code === code) || LOCALES[0];
}

export function isSupportedLocale(code: string): boolean {
  return ENABLED_LOCALES.includes(code);
}

export function isIndexableLocale(code: string): boolean {
  return INDEXABLE_LOCALES.includes(code as (typeof INDEXABLE_LOCALES)[number]);
}
