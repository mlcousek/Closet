import * as Location from 'expo-location';
import { getLocales } from 'expo-localization';

import { getSetting, setSetting } from '@/db/settings';
import { defaultTemperatureUnit, type TemperatureUnit } from '@/i18n/format';

import { roundCoordinate, type Place, type Weather, type WeatherStore } from './weather';

const CITY = 'weather.city';
const CACHE = 'weather.cache';
const UNIT = 'weather.unit';
const REMINDER = 'reminder.time';

function readJson<T>(key: string): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** The city chosen to use instead of the device location, or null to use the location. */
export const getChosenCity = () => readJson<Place>(CITY);
export const setChosenCity = (place: Place | null) =>
  setSetting(CITY, place ? JSON.stringify(place) : null);

export const weatherStore: WeatherStore = {
  read: () => readJson<Weather>(CACHE),
  write: (weather) => setSetting(CACHE, JSON.stringify(weather)),
};

/** Celsius or Fahrenheit: the user's choice, otherwise what the device region uses. */
export function getTemperatureUnit(): TemperatureUnit {
  const stored = getSetting(UNIT);
  if (stored === 'celsius' || stored === 'fahrenheit') return stored;
  return defaultTemperatureUnit(getLocales()[0]?.regionCode);
}
export const setTemperatureUnit = (unit: TemperatureUnit | null) => setSetting(UNIT, unit);

export type PlaceResult =
  | { status: 'ok'; place: Place }
  /** Location is not allowed and no city is chosen: the user has to pick a city. */
  | { status: 'needsCity' };

/**
 * Where to get the weather for: the chosen city, otherwise the device's
 * approximate location while the app is in use. The location never leaves the
 * device except, rounded, in the forecast request.
 */
export async function resolvePlace(): Promise<PlaceResult> {
  const city = getChosenCity();
  if (city) return { status: 'ok', place: city };
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'needsCity' };
    const position =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    return {
      status: 'ok',
      place: {
        name: '',
        // Rounded to about a kilometre before it is used or cached anywhere.
        latitude: roundCoordinate(position.coords.latitude),
        longitude: roundCoordinate(position.coords.longitude),
      },
    };
  } catch {
    return { status: 'needsCity' };
  }
}

export type ReminderTime = { hour: number; minute: number };

export function getReminderTime(): ReminderTime | null {
  const time = readJson<ReminderTime>(REMINDER);
  return time && Number.isInteger(time.hour) && Number.isInteger(time.minute) ? time : null;
}
export const setReminderTime = (time: ReminderTime | null) =>
  setSetting(REMINDER, time ? JSON.stringify(time) : null);
