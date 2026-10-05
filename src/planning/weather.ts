import type { Day } from './dates';

export type Place = { name: string; latitude: number; longitude: number };

export type DayWeather = {
  day: Day;
  /** Apparent ("feels like") temperatures in Celsius. */
  feelsMin: number;
  feelsMax: number;
  /** Chance of rain or snow, 0 to 100. */
  precipitationChance: number;
  /** Expected amount in millimetres. */
  precipitation: number;
  /** Strongest wind in km/h. */
  wind: number;
  /** WMO weather code. */
  code: number;
};

export type Weather = {
  place: Place;
  /** When the data was fetched, epoch milliseconds. */
  fetchedAt: number;
  current: { temperature: number; feelsLike: number; code: number } | null;
  days: DayWeather[];
};

export type Condition = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** Groups WMO weather codes into the handful of conditions the interface shows. */
export function conditionOf(code: number): Condition {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloudy';
}

type FetchJson = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const defaultFetch: FetchJson = (url) => fetch(url);

/** Coordinates rounded to about one kilometre: enough for a forecast, and no more precise than needed. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

type ForecastPayload = {
  current?: { temperature_2m?: number; apparent_temperature?: number; weather_code?: number };
  daily?: {
    time?: string[];
    apparent_temperature_max?: (number | null)[];
    apparent_temperature_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    weather_code?: (number | null)[];
  };
};

/** Turns an Open-Meteo forecast response into the app's weather shape. Days with gaps are left out. */
export function parseForecast(payload: unknown, place: Place, fetchedAt: number): Weather {
  const data = (payload ?? {}) as ForecastPayload;
  const daily = data.daily ?? {};
  const days: DayWeather[] = [];
  (daily.time ?? []).forEach((day, index) => {
    const feelsMax = daily.apparent_temperature_max?.[index];
    const feelsMin = daily.apparent_temperature_min?.[index];
    if (typeof feelsMax !== 'number' || typeof feelsMin !== 'number') return;
    days.push({
      day,
      feelsMax,
      feelsMin,
      precipitationChance: daily.precipitation_probability_max?.[index] ?? 0,
      precipitation: daily.precipitation_sum?.[index] ?? 0,
      wind: daily.wind_speed_10m_max?.[index] ?? 0,
      code: daily.weather_code?.[index] ?? 0,
    });
  });
  const current = data.current;
  return {
    place,
    fetchedAt,
    current:
      typeof current?.temperature_2m === 'number'
        ? {
            temperature: current.temperature_2m,
            feelsLike: current.apparent_temperature ?? current.temperature_2m,
            code: current.weather_code ?? 0,
          }
        : null,
    days,
  };
}

/** Fetches current conditions and a daily forecast. No key or account is needed. */
export async function fetchWeather(
  place: Place,
  fetchImpl: FetchJson = defaultFetch,
  now: () => number = Date.now,
): Promise<Weather> {
  const query = [
    `latitude=${roundCoordinate(place.latitude)}`,
    `longitude=${roundCoordinate(place.longitude)}`,
    'current=temperature_2m,apparent_temperature,weather_code',
    'daily=apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,weather_code',
    'timezone=auto',
    'forecast_days=14',
    'past_days=1',
  ].join('&');
  const response = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error('Weather request failed');
  const weather = parseForecast(await response.json(), place, now());
  if (weather.days.length === 0) throw new Error('Weather response had no days');
  return weather;
}

type GeocodingPayload = {
  results?: {
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
  }[];
};

/** Looks up places by name for the city setting. */
export async function searchPlaces(
  name: string,
  language: string,
  fetchImpl: FetchJson = defaultFetch,
): Promise<Place[]> {
  const term = name.trim();
  if (term.length < 2) return [];
  const response = await fetchImpl(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=6&language=${encodeURIComponent(language)}&format=json`,
  );
  if (!response.ok) throw new Error('Place search failed');
  const data = ((await response.json()) ?? {}) as GeocodingPayload;
  return (data.results ?? [])
    .filter(
      (result) =>
        typeof result.name === 'string' &&
        typeof result.latitude === 'number' &&
        typeof result.longitude === 'number',
    )
    .map((result) => ({
      name: [result.name, result.admin1, result.country]
        .filter((part, index, parts) => part && parts.indexOf(part) === index)
        .join(', '),
      latitude: result.latitude!,
      longitude: result.longitude!,
    }));
}

export const WEATHER_FRESH_MS = 60 * 60 * 1000;

export type WeatherStore = {
  read(): Weather | null;
  write(weather: Weather): void;
};

export type WeatherResult =
  { status: 'fresh' | 'stale'; weather: Weather } | { status: 'unavailable'; weather: null };

/**
 * Weather for a place, at most an hour old when the network works. When it
 * does not, the last weather that was fetched is returned as stale; when there
 * has never been any, the result is unavailable and callers fall back to the season.
 */
export async function loadWeather(
  place: Place | null,
  store: WeatherStore,
  fetcher: (place: Place) => Promise<Weather> = (target) => fetchWeather(target),
  now: () => number = Date.now,
): Promise<WeatherResult> {
  const cached = store.read();
  const samePlace =
    cached !== null &&
    place !== null &&
    roundCoordinate(cached.place.latitude) === roundCoordinate(place.latitude) &&
    roundCoordinate(cached.place.longitude) === roundCoordinate(place.longitude);
  if (!place) {
    return cached ? { status: 'stale', weather: cached } : { status: 'unavailable', weather: null };
  }
  if (samePlace && now() - cached.fetchedAt < WEATHER_FRESH_MS) {
    return { status: 'fresh', weather: cached };
  }
  try {
    const weather = await fetcher(place);
    store.write(weather);
    return { status: 'fresh', weather };
  } catch {
    // Weather for another place would be misleading, so only the same place counts as a fallback.
    return samePlace
      ? { status: 'stale', weather: cached }
      : { status: 'unavailable', weather: null };
  }
}
