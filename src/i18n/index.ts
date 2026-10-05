import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getSetting, setSetting } from '@/db/settings';

import cs from './cs.json';
import en from './en.json';
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_SETTING_KEY,
  isLanguage,
  resolveLanguage,
  type Language,
} from './language';

const deviceLanguages = () => getLocales().map((locale) => locale.languageCode);

/** Initialises translations. The database must be open, because the override is stored there. */
export function initI18n(): void {
  if (i18n.isInitialized) return;
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, cs: { translation: cs } },
    lng: resolveLanguage(deviceLanguages(), getSetting(LANGUAGE_SETTING_KEY)),
    fallbackLng: FALLBACK_LANGUAGE,
    interpolation: { escapeValue: false },
  });
}

/** The stored override, or null when the app follows the device language. */
export function getLanguageOverride(): Language | null {
  const stored = getSetting(LANGUAGE_SETTING_KEY);
  return isLanguage(stored) ? stored : null;
}

/** Sets or clears the override and switches the interface immediately. */
export async function setLanguageOverride(language: Language | null): Promise<void> {
  setSetting(LANGUAGE_SETTING_KEY, language);
  await i18n.changeLanguage(resolveLanguage(deviceLanguages(), language));
}

export default i18n;
