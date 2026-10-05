import { fromDay, toDay, type Day } from '@/planning/dates';
import {
  fetchWeather,
  parseForecast,
  roundCoordinate,
  type DayWeather,
  type Place,
} from '@/planning/weather';

type FetchJson = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export type TripWeather = {
  day: Day;
  weather: DayWeather | null;
  /** True when the weather is what the same day was like a year earlier, not a forecast. */
  typical: boolean;
};

/** The same date a year earlier; 29 February becomes 28 February. */
export function yearBefore(day: Day): Day {
  const date = fromDay(day);
  const month = date.getMonth();
  date.setFullYear(date.getFullYear() - 1);
  if (date.getMonth() !== month) date.setDate(0);
  return toDay(date);
}

/**
 * What the given days were like a year earlier, from the Open-Meteo archive,
 * keyed by the day asked for. Used for days too far ahead for a forecast.
 */
export async function fetchTypical(
  place: Place,
  days: Day[],
  fetchImpl: FetchJson = (url) => fetch(url),
): Promise<Map<Day, DayWeather>> {
  if (days.length === 0) return new Map();
  const earlier = days.map(yearBefore);
  const sorted = [...earlier].sort();
  const query = [
    `latitude=${roundCoordinate(place.latitude)}`,
    `longitude=${roundCoordinate(place.longitude)}`,
    `start_date=${sorted[0]}`,
    `end_date=${sorted[sorted.length - 1]}`,
    'daily=apparent_temperature_max,apparent_temperature_min,precipitation_sum,wind_speed_10m_max,weather_code',
    'timezone=auto',
  ].join('&');
  const response = await fetchImpl(`https://archive-api.open-meteo.com/v1/archive?${query}`);
  if (!response.ok) throw new Error('Archive request failed');
  const past = new Map(
    parseForecast(await response.json(), place, 0).days.map((entry) => [entry.day, entry]),
  );
  const result = new Map<Day, DayWeather>();
  days.forEach((day, index) => {
    const entry = past.get(earlier[index]);
    if (!entry) return;
    // The archive has no chance of rain, only what fell: a wet day counts as certain rain.
    result.set(day, { ...entry, day, precipitationChance: entry.precipitation >= 1 ? 100 : 0 });
  });
  return result;
}

/**
 * Weather for each day of a trip: the forecast where it reaches, typical
 * conditions beyond it, and nothing when neither could be fetched, in which
 * case the day falls back to the season.
 */
export async function tripWeather(
  place: Place,
  days: Day[],
  sources: {
    forecast?: (place: Place) => Promise<{ days: DayWeather[] }>;
    typical?: (place: Place, days: Day[]) => Promise<Map<Day, DayWeather>>;
  } = {},
): Promise<TripWeather[]> {
  const forecast = sources.forecast ?? ((target: Place) => fetchWeather(target));
  const typical = sources.typical ?? ((target: Place, list: Day[]) => fetchTypical(target, list));
  const forecastDays = new Map<Day, DayWeather>();
  try {
    for (const entry of (await forecast(place)).days) forecastDays.set(entry.day, entry);
  } catch {
    // Days without a forecast are looked up as typical below.
  }
  const missing = days.filter((day) => !forecastDays.has(day));
  let typicalDays = new Map<Day, DayWeather>();
  try {
    typicalDays = await typical(place, missing);
  } catch {
    // Without either source the day is planned from the season.
  }
  return days.map((day) => {
    const fromForecast = forecastDays.get(day);
    if (fromForecast) return { day, weather: fromForecast, typical: false };
    const fromArchive = typicalDays.get(day);
    return { day, weather: fromArchive ?? null, typical: !!fromArchive };
  });
}
