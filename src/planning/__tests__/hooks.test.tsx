import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { itemRepository } from '@/closet/repository';
import type { ItemDetails } from '@/closet/types';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { outfitRepository } from '@/outfits/repository';

import { calendarRepository } from '../calendar';
import { addDays, seasonOf, today } from '../dates';
import {
  getChosenCity,
  getReminderTime,
  getTemperatureUnit,
  resolvePlace,
  setChosenCity,
  setReminderTime,
  setTemperatureUnit,
  useTemperatureUnit,
  weatherStore,
} from '../settings';
import type { History } from '../suggestions';
import {
  useCalendar,
  useInvalidatePlanning,
  useInvalidateWeather,
  useStreak,
  useSuggestions,
  useWearStats,
  useWeather,
  weatherFor,
  type WeatherState,
} from '../usePlanning';
import type { Place, Weather } from '../weather';

const mockDb = { current: null as Db | null };
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('@/db/client', () => ({ getDb: () => mockDb.current }));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) => {
    if (value === null) mockSettings.delete(key);
    else mockSettings.set(key, value);
  },
}));

const mockLocation = { permission: jest.fn(), lastKnown: jest.fn(), current: jest.fn() };
jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockLocation.permission(...args),
  getLastKnownPositionAsync: (...args: unknown[]) => mockLocation.lastKnown(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockLocation.current(...args),
}));

const mockLocale = { list: [{ regionCode: 'CZ' }] as { regionCode: string | null }[] };
jest.mock('expo-localization', () => ({ getLocales: () => mockLocale.list }));

// The outfit hooks pull in the try-on code, which needs the device; none of it is used here.
jest.mock('@/outfits/renderActions', () => ({
  avatarBasePath: () => null,
  currentFingerprint: () => null,
  useRenderVersion: () => 0,
}));
jest.mock('@/profile/useProfile', () => ({ useProfile: () => ({ data: null }) }));

/** Everything the suggestion rules were asked, so what the hook hands them can be checked. */
const mockSuggestInputs: { history?: History }[] = [];
jest.mock('../suggestions', () => {
  const actual = jest.requireActual('../suggestions');
  return {
    ...actual,
    suggest: (input: { history?: History }) => {
      mockSuggestInputs.push(input);
      return actual.suggest(input);
    },
  };
});

const mockFetch = jest.fn();
const realFetch = global.fetch;

const PRAGUE: Place = { name: 'Prague, Czechia', latitude: 50.08, longitude: 14.43 };
const CAPE_TOWN: Place = { name: 'Cape Town', latitude: -33.92, longitude: 18.42 };
const TODAY = today();

type Forecast = { feelsMax?: number; feelsMin?: number; rainChance?: number; rain?: number };
/** An Open-Meteo answer for yesterday, today and the three days after. */
const forecast = ({ feelsMax = 14, feelsMin = 8, rainChance = 10, rain = 0 }: Forecast = {}) => {
  const days = [-1, 0, 1, 2, 3].map((offset) => addDays(TODAY, offset));
  return {
    current: { temperature_2m: 12, apparent_temperature: 11, weather_code: 2 },
    daily: {
      time: days,
      apparent_temperature_max: days.map(() => feelsMax),
      apparent_temperature_min: days.map(() => feelsMin),
      precipitation_probability_max: days.map(() => rainChance),
      precipitation_sum: days.map(() => rain),
      wind_speed_10m_max: days.map(() => 10),
      weather_code: days.map(() => 2),
    },
  };
};
const answerWith = (payload: unknown) =>
  mockFetch.mockImplementation(async () => ({ ok: true, json: async () => payload }));
const offline = () =>
  mockFetch.mockImplementation(async () => {
    throw new Error('Network request failed');
  });
const requestedUrls = () => mockFetch.mock.calls.map((call) => String(call[0]));

const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

const details = (patch: Partial<ItemDetails> = {}): ItemDetails => ({
  name: null,
  category: 'tops',
  subcategory: null,
  colours: [],
  seasons: [],
  occasions: [],
  warmth: 3,
  brand: null,
  size: null,
  price: null,
  currency: null,
  purchasedAt: null,
  notes: null,
  sourceUrl: null,
  ...patch,
});
const images = (name: string) => ({
  originalPath: `images/items/${name}.jpg`,
  cutoutPath: null,
  thumbPath: `images/items/${name}-t.jpg`,
});
/** A top, a bottom and shoes for mild weather, saved as one outfit. */
const seedOutfit = async () => {
  const top = await itemRepository.create(
    details({ name: 'Shirt', category: 'tops' }),
    images('a'),
  );
  const bottom = await itemRepository.create(
    details({ name: 'Jeans', category: 'bottoms' }),
    images('b'),
  );
  const shoes = await itemRepository.create(
    details({ name: 'Sneakers', category: 'shoes' }),
    images('c'),
  );
  const outfit = await outfitRepository.create(
    [
      { itemId: top.id, slot: 'top', position: 0 },
      { itemId: bottom.id, slot: 'bottom', position: 0 },
      { itemId: shoes.id, slot: 'shoes', position: 0 },
    ],
    { name: 'Everyday' },
  );
  return { top, bottom, shoes, outfit };
};

beforeEach(async () => {
  mockDb.current = (await createTestDb()).db;
  mockSettings.clear();
  mockSuggestInputs.length = 0;
  mockLocale.list = [{ regionCode: 'CZ' }];
  mockLocation.permission.mockReset().mockResolvedValue({ granted: false });
  mockLocation.lastKnown.mockReset().mockResolvedValue(null);
  mockLocation.current.mockReset().mockResolvedValue({ coords: { latitude: 0, longitude: 0 } });
  mockFetch.mockReset();
  answerWith(forecast());
  global.fetch = mockFetch as never;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('temperature unit', () => {
  // First in this file on purpose: the hook remembers a change for the rest of the run.
  it('follows the device region until it is changed, then shows each change at once', () => {
    mockLocale.list = [{ regionCode: 'US' }];
    const { result } = renderHook(() => useTemperatureUnit());
    expect(result.current).toBe('fahrenheit');

    act(() => setTemperatureUnit('celsius'));
    expect(result.current).toBe('celsius');
    expect(mockSettings.get('weather.unit')).toBe('celsius');

    // Back to "as the region has it".
    act(() => setTemperatureUnit(null));
    expect(result.current).toBe('fahrenheit');
    expect(mockSettings.has('weather.unit')).toBe(false);
  });

  it.each([
    ['US', 'fahrenheit'],
    ['us', 'fahrenheit'],
    ['LR', 'fahrenheit'],
    ['CZ', 'celsius'],
    ['GB', 'celsius'],
    [null, 'celsius'],
  ])('defaults for region %s to %s', (regionCode, unit) => {
    mockLocale.list = [{ regionCode }];
    expect(getTemperatureUnit()).toBe(unit);
  });

  it('defaults to Celsius when the device reports no locale at all', () => {
    mockLocale.list = [];
    expect(getTemperatureUnit()).toBe('celsius');
  });

  it("prefers the user's choice over the region, and ignores a stored value it does not know", () => {
    mockLocale.list = [{ regionCode: 'US' }];
    mockSettings.set('weather.unit', 'celsius');
    expect(getTemperatureUnit()).toBe('celsius');

    mockLocale.list = [{ regionCode: 'CZ' }];
    mockSettings.set('weather.unit', 'fahrenheit');
    expect(getTemperatureUnit()).toBe('fahrenheit');

    mockSettings.set('weather.unit', 'kelvin');
    expect(getTemperatureUnit()).toBe('celsius');
  });
});

describe('where the weather is for', () => {
  it('uses the chosen city without asking for the location', async () => {
    setChosenCity(PRAGUE);

    expect(await resolvePlace()).toEqual({ status: 'ok', place: PRAGUE });

    expect(mockLocation.permission).not.toHaveBeenCalled();
    expect(mockLocation.lastKnown).not.toHaveBeenCalled();
  });

  it('remembers the chosen city and forgets it again', () => {
    expect(getChosenCity()).toBeNull();
    setChosenCity(PRAGUE);
    expect(getChosenCity()).toEqual(PRAGUE);
    expect(JSON.parse(mockSettings.get('weather.city')!)).toEqual(PRAGUE);

    setChosenCity(null);
    expect(getChosenCity()).toBeNull();
    expect(mockSettings.has('weather.city')).toBe(false);
  });

  it('needs a city when the location is not allowed, and does not read a position', async () => {
    mockLocation.permission.mockResolvedValue({ granted: false });

    expect(await resolvePlace()).toEqual({ status: 'needsCity' });

    expect(mockLocation.lastKnown).not.toHaveBeenCalled();
    expect(mockLocation.current).not.toHaveBeenCalled();
  });

  it('uses the last known position, rounded to about a kilometre, without waking the GPS', async () => {
    mockLocation.permission.mockResolvedValue({ granted: true });
    mockLocation.lastKnown.mockResolvedValue({
      coords: { latitude: 50.087654, longitude: 14.421234, accuracy: 5 },
    });

    expect(await resolvePlace()).toEqual({
      status: 'ok',
      place: { name: '', latitude: 50.09, longitude: 14.42 },
    });
    expect(mockLocation.current).not.toHaveBeenCalled();
  });

  it('asks for a coarse current position when none is known yet', async () => {
    mockLocation.permission.mockResolvedValue({ granted: true });
    mockLocation.lastKnown.mockResolvedValue(null);
    mockLocation.current.mockResolvedValue({
      coords: { latitude: -33.924869, longitude: 18.424055 },
    });

    expect(await resolvePlace()).toEqual({
      status: 'ok',
      place: { name: '', latitude: -33.92, longitude: 18.42 },
    });
    expect(mockLocation.current).toHaveBeenCalledWith({ accuracy: 2 });
  });

  it.each(['permission', 'lastKnown', 'current'] as const)(
    'needs a city when the location service fails (%s)',
    async (step) => {
      mockLocation.permission.mockResolvedValue({ granted: true });
      mockLocation[step].mockRejectedValue(new Error('Location services are off'));

      expect(await resolvePlace()).toEqual({ status: 'needsCity' });
    },
  );

  it('falls back to the location when the stored city cannot be read', async () => {
    mockSettings.set('weather.city', '{"name":"Pra');
    mockLocation.permission.mockResolvedValue({ granted: true });
    mockLocation.lastKnown.mockResolvedValue({ coords: { latitude: 50.1, longitude: 14.4 } });

    expect(getChosenCity()).toBeNull();
    expect(await resolvePlace()).toMatchObject({ status: 'ok', place: { latitude: 50.1 } });
    expect(mockLocation.permission).toHaveBeenCalledTimes(1);
  });
});

describe('reminder time', () => {
  it('has none until one is set, keeps it, and forgets it again', () => {
    expect(getReminderTime()).toBeNull();

    setReminderTime({ hour: 7, minute: 30 });
    expect(getReminderTime()).toEqual({ hour: 7, minute: 30 });

    setReminderTime({ hour: 0, minute: 0 });
    expect(getReminderTime()).toEqual({ hour: 0, minute: 0 });

    setReminderTime(null);
    expect(getReminderTime()).toBeNull();
    expect(mockSettings.has('reminder.time')).toBe(false);
  });

  it.each([
    ['half an hour as a fraction', '{"hour":7.5,"minute":0}'],
    ['no minute', '{"hour":7}'],
    ['no hour', '{"minute":30}'],
    ['text instead of numbers', '{"hour":"7","minute":"30"}'],
    ['nothing inside', '{}'],
    ['a stored null', 'null'],
    ['a cut-off value', '{"hour":7,"min'],
    ['something that is not JSON', 'seven thirty'],
  ])('ignores a stored time with %s', (_label, stored) => {
    mockSettings.set('reminder.time', stored);
    expect(getReminderTime()).toBeNull();
  });
});

describe('weather cache', () => {
  const weather: Weather = {
    place: PRAGUE,
    fetchedAt: 1_760_000_000_000,
    current: { temperature: 12, feelsLike: 11, code: 2 },
    days: [
      {
        day: '2026-10-06',
        feelsMin: 8,
        feelsMax: 14,
        precipitationChance: 10,
        precipitation: 0,
        wind: 10,
        code: 2,
      },
    ],
  };

  it('is empty at first, keeps the last weather written and replaces it with newer weather', () => {
    expect(weatherStore.read()).toBeNull();

    weatherStore.write(weather);
    expect(weatherStore.read()).toEqual(weather);

    weatherStore.write({ ...weather, fetchedAt: 1_760_000_999_000, days: [] });
    expect(weatherStore.read()).toEqual({ ...weather, fetchedAt: 1_760_000_999_000, days: [] });
    expect([...mockSettings.keys()]).toEqual(['weather.cache']);
  });

  it('reads damaged stored weather as none', () => {
    mockSettings.set('weather.cache', '{"place":{"name":"Prague"');
    expect(weatherStore.read()).toBeNull();
    mockSettings.set('weather.cache', '');
    expect(weatherStore.read()).toBeNull();
  });
});

describe('useWeather', () => {
  const load = async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(() => useWeather(), { wrapper });
    await waitFor(() => expect(view.result.current.isFetching).toBe(false));
    return view.result.current;
  };

  it('fetches the forecast of the chosen city and caches it', async () => {
    setChosenCity(PRAGUE);

    const query = await load();

    expect(query.data?.status).toBe('fresh');
    expect(query.data?.weather?.place).toEqual(PRAGUE);
    expect(query.data?.weather?.days.map((entry) => entry.day)).toEqual(
      [-1, 0, 1, 2, 3].map((offset) => addDays(TODAY, offset)),
    );
    expect(query.data?.weather?.current).toEqual({ temperature: 12, feelsLike: 11, code: 2 });
    expect(requestedUrls()).toHaveLength(1);
    expect(requestedUrls()[0]).toContain('latitude=50.08&longitude=14.43');
    expect(mockLocation.permission).not.toHaveBeenCalled();
    expect(weatherStore.read()?.place).toEqual(PRAGUE);
  });

  it('fetches for the device location, rounded, when no city is chosen', async () => {
    mockLocation.permission.mockResolvedValue({ granted: true });
    mockLocation.lastKnown.mockResolvedValue({
      coords: { latitude: 50.123456, longitude: 14.987654 },
    });

    const query = await load();

    expect(query.data?.status).toBe('fresh');
    expect(query.data?.weather?.place).toEqual({ name: '', latitude: 50.12, longitude: 14.99 });
    expect(requestedUrls()[0]).toContain('latitude=50.12&longitude=14.99');
    expect(requestedUrls()[0]).not.toContain('50.123456');
  });

  it('says a city is needed when the location is refused and there is no earlier weather', async () => {
    const query = await load();

    expect(query.data).toEqual({ status: 'needsCity', weather: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows the earlier weather as stale when the location is refused later on', async () => {
    const earlier: Weather = {
      place: { name: '', latitude: 50.12, longitude: 14.99 },
      fetchedAt: Date.now() - 5 * 60 * 1000,
      current: null,
      days: [
        {
          day: TODAY,
          feelsMin: 1,
          feelsMax: 5,
          precipitationChance: 0,
          precipitation: 0,
          wind: 3,
          code: 0,
        },
      ],
    };
    weatherStore.write(earlier);

    const query = await load();

    expect(query.data).toEqual({ status: 'stale', weather: earlier });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses weather fetched a moment ago for the same city without asking again', async () => {
    setChosenCity(PRAGUE);
    await load();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Another screen, with its own cache of queries, asks shortly after.
    const query = await load();

    expect(query.data?.status).toBe('fresh');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when offline with nothing cached, and stale when the same city was cached', async () => {
    setChosenCity(PRAGUE);
    offline();
    expect((await load()).data).toEqual({ status: 'unavailable', weather: null });

    const old: Weather = {
      place: PRAGUE,
      fetchedAt: Date.now() - 3 * 3600_000,
      current: null,
      days: [],
    };
    weatherStore.write(old);
    expect((await load()).data).toEqual({ status: 'stale', weather: old });
  });
});

describe('weatherFor', () => {
  const day = (name: string, feelsMax: number) => ({
    day: name,
    feelsMin: 0,
    feelsMax,
    precipitationChance: 0,
    precipitation: 0,
    wind: 0,
    code: 0,
  });
  const state: WeatherState = {
    status: 'fresh',
    weather: {
      place: PRAGUE,
      fetchedAt: 0,
      current: null,
      days: [day('2026-10-06', 10), day('2026-10-07', 20)],
    },
  };

  it('finds the forecast of a day', () => {
    expect(weatherFor(state, '2026-10-07')).toEqual(day('2026-10-07', 20));
    expect(weatherFor(state, '2026-10-06')?.feelsMax).toBe(10);
  });

  it('has nothing for a day outside the forecast, or without weather', () => {
    expect(weatherFor(state, '2026-10-08')).toBeNull();
    expect(weatherFor(undefined, '2026-10-06')).toBeNull();
    expect(weatherFor({ status: 'needsCity', weather: null }, '2026-10-06')).toBeNull();
    expect(weatherFor({ status: 'unavailable', weather: null }, '2026-10-06')).toBeNull();
  });
});

describe('calendar hooks', () => {
  const D1 = '2026-09-01';
  const D2 = '2026-09-02';
  const D3 = '2026-09-03';

  it('groups the entries of a range by day, days in order and entries in the order they were added', async () => {
    await calendarRepository.plan(D2, 'second-day-first');
    await calendarRepository.plan(D1, 'first-day');
    await calendarRepository.plan(D2, 'second-day-second');
    await calendarRepository.plan('2026-08-31', 'before-the-range');
    await calendarRepository.plan('2026-09-04', 'after-the-range');
    const removed = await calendarRepository.plan(D3, 'removed');
    await calendarRepository.remove(removed.id);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCalendar(D1, D3), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const byDay = result.current.data!;
    expect([...byDay.keys()]).toEqual([D1, D2]);
    expect(byDay.get(D1)!.map((entry) => entry.outfitId)).toEqual(['first-day']);
    expect(byDay.get(D2)!.map((entry) => [entry.outfitId, entry.position, entry.state])).toEqual([
      ['second-day-first', 0, 'planned'],
      ['second-day-second', 1, 'planned'],
    ]);
    expect(byDay.has(D3)).toBe(false);
  });

  it('gives an empty calendar for a range without entries', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCalendar(D1, D3), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.size).toBe(0);
  });

  it('keeps showing the previous range while another one loads', async () => {
    await calendarRepository.plan(D1, 'first-day');
    await calendarRepository.plan('2026-10-01', 'next-month');
    const { wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      ({ from, to }: { from: string; to: string }) => useCalendar(from, to),
      { wrapper, initialProps: { from: D1, to: D3 } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ from: '2026-10-01', to: '2026-10-31' });
    // Not empty in between: the month just left stays on screen.
    expect([...result.current.data!.keys()]).toEqual([D1]);
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect([...result.current.data!.keys()]).toEqual(['2026-10-01']);
  });

  it('counts the streak of days with a worn outfit up to today', async () => {
    await calendarRepository.logWorn(TODAY, 'o1');
    await calendarRepository.logWorn(addDays(TODAY, -1), 'o1');
    await calendarRepository.logWorn(addDays(TODAY, -2), 'o2');
    // A gap: this one is not part of the streak.
    await calendarRepository.logWorn(addDays(TODAY, -4), 'o2');
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useStreak(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(3);
  });

  it('reports how often and when an outfit and each of its items were worn', async () => {
    const { outfit, top, shoes } = await seedOutfit();
    const other = await outfitRepository.create([{ itemId: top.id, slot: 'top', position: 0 }]);
    await calendarRepository.logWorn(addDays(TODAY, -5), outfit.id);
    await calendarRepository.logWorn(addDays(TODAY, -2), outfit.id);
    await calendarRepository.logWorn(addDays(TODAY, -1), other.id);
    await calendarRepository.plan(addDays(TODAY, 2), outfit.id);
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({
        outfit: useWearStats('outfit', outfit.id),
        top: useWearStats('item', top.id),
        shoes: useWearStats('item', shoes.id),
        unknown: useWearStats('item', 'never-worn'),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(Object.values(result.current).every((query) => query.isSuccess)).toBe(true),
    );

    // A plan for later is not a wear.
    expect(result.current.outfit.data).toEqual({ count: 2, lastWorn: addDays(TODAY, -2) });
    // The top is in both outfits.
    expect(result.current.top.data).toEqual({ count: 3, lastWorn: addDays(TODAY, -1) });
    expect(result.current.shoes.data).toEqual({ count: 2, lastWorn: addDays(TODAY, -2) });
    expect(result.current.unknown.data).toEqual({ count: 0, lastWorn: null });
  });

  it('does not mix up an item and an outfit that happen to share an id', async () => {
    const { outfit } = await seedOutfit();
    await calendarRepository.logWorn(TODAY, outfit.id);
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({
        asOutfit: useWearStats('outfit', outfit.id),
        asItem: useWearStats('item', outfit.id),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.asItem.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.asOutfit.isSuccess).toBe(true));

    expect(result.current.asOutfit.data?.count).toBe(1);
    expect(result.current.asItem.data?.count).toBe(0);
  });
});

describe('refreshing', () => {
  it('reloads everything read from the calendar, and not the weather', async () => {
    setChosenCity(PRAGUE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        streak: useStreak(),
        range: useCalendar(TODAY, TODAY),
        stats: useWearStats('outfit', 'o1'),
        weather: useWeather(),
        invalidate: useInvalidatePlanning(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.streak.data).toBe(0));
    await waitFor(() => expect(result.current.weather.isSuccess).toBe(true));
    const weatherBefore = result.current.weather.dataUpdatedAt;

    await calendarRepository.logWorn(TODAY, 'o1');
    // Nothing tells the screens yet.
    expect(result.current.streak.data).toBe(0);

    await act(async () => {
      await result.current.invalidate();
    });

    await waitFor(() => expect(result.current.streak.data).toBe(1));
    await waitFor(() => expect(result.current.stats.data?.count).toBe(1));
    await waitFor(() => expect(result.current.range.data?.get(TODAY)).toHaveLength(1));
    expect(result.current.weather.dataUpdatedAt).toBe(weatherBefore);
  });

  it('reloads the weather after the city was changed, and not the calendar', async () => {
    setChosenCity(PRAGUE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        streak: useStreak(),
        weather: useWeather(),
        invalidate: useInvalidateWeather(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.weather.data?.weather?.place).toEqual(PRAGUE));
    await waitFor(() => expect(result.current.streak.isSuccess).toBe(true));

    setChosenCity(CAPE_TOWN);
    await calendarRepository.logWorn(TODAY, 'o1');
    expect(result.current.weather.data?.weather?.place).toEqual(PRAGUE);

    await act(async () => {
      await result.current.invalidate();
    });

    await waitFor(() => expect(result.current.weather.data?.weather?.place).toEqual(CAPE_TOWN));
    expect(requestedUrls()[1]).toContain('latitude=-33.92&longitude=18.42');
    expect(result.current.streak.data).toBe(0);
  });
});

describe('useSuggestions', () => {
  const render = (day = TODAY) => {
    const { wrapper } = createWrapper();
    return renderHook(() => ({ suggested: useSuggestions(day), weather: useWeather() }), {
      wrapper,
    });
  };
  const settled = async (view: ReturnType<typeof render>) => {
    await waitFor(() => expect(view.result.current.weather.isFetching).toBe(false));
    await waitFor(() => expect(view.result.current.suggested.ready).toBe(true));
    return view.result.current.suggested;
  };

  it('builds the profile of the day from its forecast', async () => {
    setChosenCity(PRAGUE);
    answerWith(forecast({ feelsMax: 30, feelsMin: 20 }));

    const { profile } = await settled(render());

    expect(profile).toMatchObject({
      band: 1,
      needsOuter: false,
      rain: false,
      source: 'forecast',
      season: seasonOf(TODAY),
    });
    // Nearer the daytime maximum than the night-time minimum.
    expect(profile.temperature).toBeCloseTo(27);
  });

  it('asks for an outer layer on a wet day in the forecast', async () => {
    setChosenCity(PRAGUE);
    answerWith(forecast({ feelsMax: 18, feelsMin: 12, rainChance: 80, rain: 6 }));

    const { profile } = await settled(render());

    expect(profile).toMatchObject({ rain: true, needsOuter: true, source: 'forecast', band: 3 });
  });

  it('falls back to the season for a day the forecast does not reach', async () => {
    setChosenCity(PRAGUE);
    const far = addDays(TODAY, 30);

    const { profile } = await settled(render(far));

    expect(profile).toMatchObject({ source: 'season', temperature: null, season: seasonOf(far) });
  });

  it('goes by the season, in the northern hemisphere, when there is no weather and no city', async () => {
    const { profile } = await settled(render());

    expect(profile).toMatchObject({
      source: 'season',
      rain: false,
      temperature: null,
      season: seasonOf(TODAY, false),
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('takes the hemisphere from the chosen city when its weather cannot be fetched', async () => {
    setChosenCity(CAPE_TOWN);
    offline();
    const view = render();

    const { profile } = await settled(view);

    expect(view.result.current.weather.data).toEqual({ status: 'unavailable', weather: null });
    expect(profile.source).toBe('season');
    expect(profile.season).toBe(seasonOf(TODAY, true));
    expect(profile.season).not.toBe(seasonOf(TODAY, false));
  });

  it('takes the hemisphere from where the forecast is for', async () => {
    mockLocation.permission.mockResolvedValue({ granted: true });
    mockLocation.lastKnown.mockResolvedValue({ coords: { latitude: -33.92, longitude: 18.42 } });

    const { profile } = await settled(render());

    expect(profile).toMatchObject({ source: 'forecast', season: seasonOf(TODAY, true) });
  });

  it('is not ready, and suggests nothing, until outfits and items have loaded', async () => {
    setChosenCity(PRAGUE);
    const { outfit } = await seedOutfit();
    const view = render();

    expect(view.result.current.suggested.ready).toBe(false);
    expect(view.result.current.suggested.suggestions).toEqual([]);

    const { suggestions, profile } = await settled(view);
    expect(profile.band).toBe(3);
    // The saved outfit suits a mild dry day and comes first.
    expect(suggestions[0]).toMatchObject({ outfit: { id: outfit.id }, reason: 'mild' });
    expect(suggestions[0].items.map((item) => item.name)).toEqual(['Shirt', 'Jeans', 'Sneakers']);
  });

  it('is ready with nothing to suggest for an empty closet', async () => {
    const suggested = await settled(render());
    expect(suggested.suggestions).toEqual([]);
  });

  it('hands recent wear to the rules, which then pass over what was just worn', async () => {
    setChosenCity(PRAGUE);
    const { outfit, top, bottom, shoes } = await seedOutfit();
    await calendarRepository.logWorn(addDays(TODAY, -1), outfit.id);
    await calendarRepository.logWorn(addDays(TODAY, -3), outfit.id);
    const view = render();
    await settled(view);

    const last = () => mockSuggestInputs[mockSuggestInputs.length - 1];
    await waitFor(() => expect(last().history?.wearCounts.size).toBe(3));

    expect(last().history).toEqual({
      recentOutfitIds: new Set([outfit.id]),
      recentItemIds: new Set([top.id, bottom.id, shoes.id]),
      wearCounts: new Map([
        [top.id, 2],
        [bottom.id, 2],
        [shoes.id, 2],
      ]),
    });
    const { suggestions } = view.result.current.suggested;
    expect(suggestions.some((suggestion) => suggestion.outfit?.id === outfit.id)).toBe(false);
  });

  it('does not count wear from before the recent period as recent', async () => {
    setChosenCity(PRAGUE);
    const { outfit, top } = await seedOutfit();
    await calendarRepository.logWorn(addDays(TODAY, -8), outfit.id);
    const view = render();
    await settled(view);

    const last = () => mockSuggestInputs[mockSuggestInputs.length - 1];
    await waitFor(() => expect(last().history?.wearCounts.get(top.id)).toBe(1));

    expect(last().history?.recentOutfitIds.size).toBe(0);
    expect(last().history?.recentItemIds.size).toBe(0);
    expect(view.result.current.suggested.suggestions[0].outfit?.id).toBe(outfit.id);
  });
});
