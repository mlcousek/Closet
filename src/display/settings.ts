import { getSetting, setSetting } from '@/db/settings';

export const DISPLAY_THEMES = ['dark', 'light', 'warm'] as const;
export type DisplayTheme = (typeof DISPLAY_THEMES)[number];

/** Colours of the display: it has its own themes, independent of the app's light or dark mode. */
export const DISPLAY_COLOURS: Record<
  DisplayTheme,
  { background: string; text: string; muted: string; panel: string }
> = {
  dark: { background: '#000000', text: '#F4F0F8', muted: '#8C8499', panel: '#15121A' },
  light: { background: '#FBF9FD', text: '#1B1622', muted: '#6D6478', panel: '#FFFFFF' },
  warm: { background: '#1F1410', text: '#FBE9D7', muted: '#B89A84', panel: '#2B1D17' },
};

const THEME = 'display.theme';
const CHARGING = 'display.startWhileCharging';

export function getDisplayTheme(): DisplayTheme {
  const stored = getSetting(THEME);
  return DISPLAY_THEMES.includes(stored as DisplayTheme) ? (stored as DisplayTheme) : 'dark';
}
export const setDisplayTheme = (theme: DisplayTheme) => setSetting(THEME, theme);

/** Whether the display opens by itself when the app is open and the phone is charging. */
export const getStartWhileCharging = () => getSetting(CHARGING) === '1';
export const setStartWhileCharging = (on: boolean) => setSetting(CHARGING, on ? '1' : null);

/** Whether the display is on screen right now, so it is never opened on top of itself. */
export const displayState = { open: false };

/** The numbers behind the display's behaviour, in one place for tuning on a real wall. */
export const DISPLAY_RULES = {
  /** Without a touch for this long, the screen dims. */
  dimAfterMs: 60_000,
  dimOpacity: 0.55,
  /** How long the exit button stays after a tap. */
  controlsMs: 5_000,
  /** Largest distance, in points, the content drifts to protect the screen. */
  shift: 12,
};

/**
 * Where the content sits at a given minute: a slow drift around the centre,
 * so no pixel shows the same thing all day.
 */
export function shiftAt(date: Date): { x: number; y: number } {
  const minute = date.getHours() * 60 + date.getMinutes();
  const step = DISPLAY_RULES.shift / 2;
  return { x: ((minute % 5) - 2) * step, y: ((Math.floor(minute / 5) % 5) - 2) * step };
}
