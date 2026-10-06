export type LengthSystem = 'metric' | 'imperial';

const CM_PER_INCH = 2.54;
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

export function lengthSystem(regionCode?: string | null): LengthSystem {
  return regionCode && IMPERIAL_REGIONS.has(regionCode.toUpperCase()) ? 'imperial' : 'metric';
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH);
}

const MIN_HEIGHT_CM = 50;
const MAX_HEIGHT_CM = 260;

/**
 * Reads a height typed by the user and returns centimetres, or null when the
 * text is empty or not a plausible height. Metric input is centimetres;
 * imperial input is feet and inches such as "5 7", "5'7" or "5ft 7in".
 */
export function parseHeight(text: string, system: LengthSystem): number | null {
  // In feet and inches every separator, a dot or comma included, sits between the two.
  const numbers =
    system === 'metric'
      ? (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((part) => Number(part.replace(',', '.')))
      : (text.match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 0) return null;
  const cm =
    system === 'metric' ? Math.round(numbers[0]) : feetInchesToCm(numbers[0], numbers[1] ?? 0);
  return cm >= MIN_HEIGHT_CM && cm <= MAX_HEIGHT_CM ? cm : null;
}

export function formatHeight(cm: number, system: LengthSystem): string {
  if (system === 'metric') return `${cm} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′ ${inches}″`;
}
