import type { Language } from './language';

export type TemperatureUnit = 'celsius' | 'fahrenheit';

const LOCALE_TAG: Record<Language, string> = { en: 'en-GB', cs: 'cs-CZ' };

/**
 * Locale tag for formatting: the interface language combined with the device
 * region when the region is known, so an English interface in the US still
 * gets US conventions.
 */
export function formatLocale(language: Language, regionCode?: string | null): string {
  if (regionCode && /^[A-Za-z]{2}$/.test(regionCode)) {
    return `${language}-${regionCode.toUpperCase()}`;
  }
  return LOCALE_TAG[language];
}

export function formatDate(
  date: Date,
  locale: string,
  style: 'short' | 'long' | 'weekday' = 'long',
): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'numeric', year: 'numeric' }
      : style === 'weekday'
        ? { weekday: 'long', day: 'numeric', month: 'long' }
        : { day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatCurrency(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/** Regions that use Fahrenheit for everyday temperatures. */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'PW', 'LR', 'FM', 'MH']);

export function defaultTemperatureUnit(regionCode?: string | null): TemperatureUnit {
  return regionCode && FAHRENHEIT_REGIONS.has(regionCode.toUpperCase()) ? 'fahrenheit' : 'celsius';
}

/** Formats a temperature given in Celsius in the requested unit. */
export function formatTemperature(celsius: number, unit: TemperatureUnit, locale: string): string {
  const value = unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius;
  const rounded = Math.round(value);
  // Avoid "-0".
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    rounded === 0 ? 0 : rounded,
  );
  return `${number}°${unit === 'fahrenheit' ? 'F' : 'C'}`;
}
