import {
  defaultTemperatureUnit,
  formatCurrency,
  formatDate,
  formatLocale,
  formatNumber,
  formatTemperature,
} from '../format';
import { resolveLanguage } from '../language';

describe('resolveLanguage', () => {
  it('uses Czech on a Czech device', () => {
    expect(resolveLanguage(['cs'], null)).toBe('cs');
    expect(resolveLanguage(['cs-CZ'], null)).toBe('cs');
  });

  it('uses English on an English device', () => {
    expect(resolveLanguage(['en'], null)).toBe('en');
  });

  it('falls back to English for an unsupported device language', () => {
    expect(resolveLanguage(['de'], null)).toBe('en');
    expect(resolveLanguage([], null)).toBe('en');
    expect(resolveLanguage([null, undefined], null)).toBe('en');
  });

  it('uses the first supported device language', () => {
    expect(resolveLanguage(['de', 'cs', 'en'], null)).toBe('cs');
  });

  it('prefers the override over the device language', () => {
    expect(resolveLanguage(['cs'], 'en')).toBe('en');
    expect(resolveLanguage(['en'], 'cs')).toBe('cs');
  });

  it('ignores an override that is not a supported language', () => {
    expect(resolveLanguage(['cs'], 'de')).toBe('cs');
  });
});

describe('formatters', () => {
  const date = new Date(2026, 9, 2); // 2 October 2026, a Friday

  it('builds a locale from language and region', () => {
    expect(formatLocale('en', 'US')).toBe('en-US');
    expect(formatLocale('cs', 'cz')).toBe('cs-CZ');
    expect(formatLocale('en', null)).toBe('en-GB');
    expect(formatLocale('cs', 'not-a-region')).toBe('cs-CZ');
  });

  it('formats dates in Czech with Czech month and weekday names', () => {
    expect(formatDate(date, 'cs-CZ')).toBe('2. října 2026');
    expect(formatDate(date, 'cs-CZ', 'weekday')).toBe('pátek 2. října');
    expect(formatDate(date, 'cs-CZ', 'short')).toBe('2. 10. 2026');
  });

  it('formats dates in English', () => {
    expect(formatDate(date, 'en-GB')).toBe('2 October 2026');
    expect(formatDate(date, 'en-US')).toBe('October 2, 2026');
  });

  it('formats numbers with locale separators', () => {
    expect(formatNumber(1234.5, 'en-GB')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'cs-CZ').replace(/\s/g, ' ')).toBe('1 234,5');
  });

  it('formats currency', () => {
    expect(formatCurrency(599, 'CZK', 'cs-CZ').replace(/\s/g, ' ')).toBe('599,00 Kč');
    expect(formatCurrency(59.9, 'EUR', 'en-GB')).toBe('€59.90');
  });

  it('formats temperature in both units', () => {
    expect(formatTemperature(24.4, 'celsius', 'cs-CZ')).toBe('24°C');
    expect(formatTemperature(0, 'fahrenheit', 'en-US')).toBe('32°F');
    expect(formatTemperature(-0.2, 'celsius', 'en-GB')).toBe('0°C');
  });

  it('defaults to Fahrenheit only in regions that use it', () => {
    expect(defaultTemperatureUnit('US')).toBe('fahrenheit');
    expect(defaultTemperatureUnit('CZ')).toBe('celsius');
    expect(defaultTemperatureUnit(null)).toBe('celsius');
  });
});
