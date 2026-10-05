export const SUPPORTED_LANGUAGES = ['en', 'cs'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: Language = 'en';
export const LANGUAGE_SETTING_KEY = 'language';

export function isLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}

/**
 * Picks the interface language: the user's override if set, otherwise the first
 * device language the app supports, otherwise English.
 */
export function resolveLanguage(
  deviceLanguageCodes: (string | null | undefined)[],
  override: string | null,
): Language {
  if (isLanguage(override)) return override;
  for (const code of deviceLanguageCodes) {
    const base = code?.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return FALLBACK_LANGUAGE;
}
