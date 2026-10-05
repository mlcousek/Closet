import { createItemRepository } from '@/closet/repository';
import type { Item, ItemDetails } from '@/closet/types';
import { createTestDb } from '@/db/testing';
import { createOutfitRepository, type Outfit } from '@/outfits/repository';

import { FutureWearError, createCalendarRepository } from '../calendar';
import { addDays, addMonths, daysBetween, monthGrid, seasonOf, toDay, weekOf } from '../dates';
import {
  NO_HISTORY,
  RULES,
  bandFor,
  clashes,
  dayProfile,
  reasonFor,
  scoreItems,
  suggest,
  type History,
} from '../suggestions';
import {
  WEATHER_FRESH_MS,
  conditionOf,
  fetchWeather,
  loadWeather,
  parseForecast,
  searchPlaces,
  type DayWeather,
  type Weather,
  type WeatherStore,
} from '../weather';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));

const details = (patch: Partial<ItemDetails> = {}): ItemDetails => ({
  name: null,
  category: 'tops',
  subcategory: null,
  colours: [],
  seasons: [],
  occasions: [],
  warmth: null,
  brand: null,
  size: null,
  price: null,
  currency: null,
  purchasedAt: null,
  notes: null,
  sourceUrl: null,
  ...patch,
});
const images = { originalPath: 'o.jpg', cutoutPath: null, thumbPath: 't.jpg' };

describe('dates', () => {
  it('writes local days and moves between them', () => {
    expect(toDay(new Date(2026, 9, 2, 23, 30))).toBe('2026-10-02');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-02', '2026-10-09')).toBe(7);
    expect(daysBetween('2026-10-09', '2026-10-02')).toBe(-7);
  });

  it('crosses a daylight-saving change without skipping or repeating a day', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('gives the week from Monday to Sunday', () => {
    expect(weekOf('2026-10-02')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weekOf('2026-10-04')[0]).toBe('2026-09-28');
    expect(weekOf('2026-10-05')[0]).toBe('2026-10-05');
  });

  it('lays a month out in full weeks with blanks for neighbouring months', () => {
    const grid = monthGrid('2026-10-15');
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(grid[4][5]).toBe('2026-10-31');
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(addMonths('2026-10-15', -1)).toBe('2026-09-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
  });

  it('knows the season in both hemispheres', () => {
    expect(seasonOf('2026-01-10')).toBe('winter');
    expect(seasonOf('2026-04-10')).toBe('spring');
    expect(seasonOf('2026-07-10')).toBe('summer');
    expect(seasonOf('2026-10-10')).toBe('autumn');
    expect(seasonOf('2026-12-10')).toBe('winter');
    expect(seasonOf('2026-01-10', true)).toBe('summer');
  });
});

describe('calendar repository', () => {
  const TODAY = '2026-10-02';
  const setup = async (today = TODAY) => {
    const { db } = await createTestDb();
    let clock = 1000;
    const now = () => clock++;
    let current = today;
    const items = createItemRepository(() => db, now);
    const outfits = createOutfitRepository(() => db, now);
    const calendar = createCalendarRepository(
      () => db,
      now,
      () => current,
    );
    const shirt = await items.create(details({ category: 'tops' }), images);
    const skirt = await items.create(details({ category: 'bottoms' }), images);
    const boots = await items.create(details({ category: 'shoes' }), images);
    const outfit = await outfits.create([
      { itemId: shirt.id, slot: 'top', position: 0 },
      { itemId: skirt.id, slot: 'bottom', position: 0 },
    ]);
    const other = await outfits.create([{ itemId: boots.id, slot: 'shoes', position: 0 }]);
    return {
      calendar,
      outfit,
      other,
      shirt,
      skirt,
      boots,
      setToday: (day: string) => (current = day),
    };
  };

  it('plans an outfit for a future day', async () => {
    const { calendar, outfit } = await setup();
    await calendar.plan('2026-10-05', outfit.id);
    expect(await calendar.range('2026-10-01', '2026-10-31')).toEqual([
      expect.objectContaining({ day: '2026-10-05', outfitId: outfit.id, state: 'planned' }),
    ]);
  });

  it('confirming a plan records one wear per item', async () => {
    const { calendar, outfit, shirt, skirt, boots } = await setup();
    const entry = await calendar.plan(TODAY, outfit.id);
    expect((await calendar.itemStats(shirt.id)).count).toBe(0);
    await calendar.markWorn(entry.id);
    expect(await calendar.itemStats(shirt.id)).toEqual({ count: 1, lastWorn: TODAY });
    expect(await calendar.itemStats(skirt.id)).toEqual({ count: 1, lastWorn: TODAY });
    expect((await calendar.itemStats(boots.id)).count).toBe(0);
    expect(await calendar.outfitStats(outfit.id)).toEqual({ count: 1, lastWorn: TODAY });
    // Confirming twice does not count twice.
    await calendar.markWorn(entry.id);
    expect((await calendar.itemStats(shirt.id)).count).toBe(1);
  });

  it('logs a past day and counts wears across days', async () => {
    const { calendar, outfit, shirt } = await setup();
    await calendar.logWorn('2026-09-28', outfit.id);
    await calendar.logWorn('2026-09-30', outfit.id);
    await calendar.logWorn(TODAY, outfit.id);
    expect(await calendar.itemStats(shirt.id)).toEqual({ count: 3, lastWorn: TODAY });
  });

  it('refuses to mark a future day as worn', async () => {
    const { calendar, outfit } = await setup();
    await expect(calendar.logWorn('2026-10-03', outfit.id)).rejects.toBeInstanceOf(FutureWearError);
    const planned = await calendar.plan('2026-10-03', outfit.id);
    await expect(calendar.markWorn(planned.id)).rejects.toBeInstanceOf(FutureWearError);
    expect((await calendar.range('2026-10-03', '2026-10-03'))[0].state).toBe('planned');
  });

  it('removing a worn entry removes its wears, and undo brings them back', async () => {
    const { calendar, outfit, shirt } = await setup();
    const entry = await calendar.logWorn(TODAY, outfit.id);
    await calendar.remove(entry.id);
    expect(await calendar.range(TODAY, TODAY)).toEqual([]);
    expect((await calendar.itemStats(shirt.id)).count).toBe(0);
    await calendar.restore(entry.id);
    expect((await calendar.itemStats(shirt.id)).count).toBe(1);
  });

  it('moves a plan to another day and replaces its outfit', async () => {
    const { calendar, outfit, other } = await setup();
    const entry = await calendar.plan('2026-10-05', outfit.id);
    await calendar.move(entry.id, '2026-10-07');
    expect(await calendar.range('2026-10-05', '2026-10-05')).toEqual([]);
    await calendar.replaceOutfit(entry.id, other.id);
    expect(await calendar.range('2026-10-07', '2026-10-07')).toEqual([
      expect.objectContaining({ outfitId: other.id, state: 'planned' }),
    ]);
  });

  it('moves the wears with a worn entry and updates them when its outfit is replaced', async () => {
    const { calendar, outfit, other, shirt, boots } = await setup();
    const entry = await calendar.logWorn(TODAY, outfit.id);
    await calendar.move(entry.id, '2026-09-30');
    expect((await calendar.itemStats(shirt.id)).lastWorn).toBe('2026-09-30');
    await calendar.replaceOutfit(entry.id, other.id);
    expect((await calendar.itemStats(shirt.id)).count).toBe(0);
    expect((await calendar.itemStats(boots.id)).count).toBe(1);
  });

  it('keeps several outfits on a day in the order they were added', async () => {
    const { calendar, outfit, other } = await setup();
    await calendar.logWorn(TODAY, outfit.id);
    await calendar.logWorn(TODAY, other.id);
    const entries = await calendar.range(TODAY, TODAY);
    expect(entries.map((entry) => entry.outfitId)).toEqual([outfit.id, other.id]);
    expect(entries.map((entry) => entry.position)).toEqual([0, 1]);
  });

  it('counts a streak that includes today', async () => {
    const { calendar, outfit } = await setup();
    for (const offset of [-4, -3, -2, -1])
      await calendar.logWorn(addDays(TODAY, offset), outfit.id);
    expect(await calendar.streak()).toBe(4);
    await calendar.logWorn(TODAY, outfit.id);
    expect(await calendar.streak()).toBe(5);
  });

  it('breaks the streak when neither today nor yesterday is logged', async () => {
    const { calendar, outfit } = await setup();
    await calendar.logWorn(addDays(TODAY, -2), outfit.id);
    await calendar.logWorn(addDays(TODAY, -3), outfit.id);
    expect(await calendar.streak()).toBe(0);
  });

  it('does not count planned days towards the streak', async () => {
    const { calendar, outfit } = await setup();
    await calendar.plan(TODAY, outfit.id);
    expect(await calendar.streak()).toBe(0);
  });

  it('reports what was worn recently and how often', async () => {
    const { calendar, outfit, other, shirt, boots } = await setup();
    await calendar.logWorn(addDays(TODAY, -2), outfit.id);
    await calendar.logWorn(addDays(TODAY, -20), other.id);
    const recent = await calendar.recentlyWorn(addDays(TODAY, -7));
    expect([...recent.outfitIds]).toEqual([outfit.id]);
    expect(recent.itemIds.has(shirt.id)).toBe(true);
    expect(recent.itemIds.has(boots.id)).toBe(false);
    const counts = await calendar.wearCounts([shirt.id, boots.id]);
    expect(counts.get(shirt.id)).toBe(1);
    expect(counts.get(boots.id)).toBe(1);
  });
});

describe('weather', () => {
  const place = { name: 'Prague', latitude: 50.0755, longitude: 14.4378 };
  const payload = {
    current: { temperature_2m: 14.2, apparent_temperature: 12.8, weather_code: 61 },
    daily: {
      time: ['2026-10-02', '2026-10-03', '2026-10-04'],
      apparent_temperature_max: [15, 9, null],
      apparent_temperature_min: [7, 2, 1],
      precipitation_probability_max: [80, 10, 0],
      precipitation_sum: [6.5, 0, 0],
      wind_speed_10m_max: [22, 40, 5],
      weather_code: [61, 3, 0],
    },
  };

  it('reads a forecast and leaves out days with gaps', () => {
    const weather = parseForecast(payload, place, 5);
    expect(weather.current).toEqual({ temperature: 14.2, feelsLike: 12.8, code: 61 });
    expect(weather.days).toEqual([
      {
        day: '2026-10-02',
        feelsMax: 15,
        feelsMin: 7,
        precipitationChance: 80,
        precipitation: 6.5,
        wind: 22,
        code: 61,
      },
      {
        day: '2026-10-03',
        feelsMax: 9,
        feelsMin: 2,
        precipitationChance: 10,
        precipitation: 0,
        wind: 40,
        code: 3,
      },
    ]);
    expect(parseForecast(null, place, 5).days).toEqual([]);
  });

  it('groups weather codes into conditions', () => {
    expect([0, 2, 45, 61, 73, 96].map(conditionOf)).toEqual([
      'clear',
      'cloudy',
      'fog',
      'rain',
      'snow',
      'storm',
    ]);
  });

  it('asks for the place rounded to about a kilometre', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => payload }));
    await fetchWeather(place, fetchMock, () => 1);
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('latitude=50.08');
    expect(url).toContain('longitude=14.44');
    expect(url).not.toContain('50.0755');
  });

  it('fails on an error response or an empty forecast', async () => {
    await expect(
      fetchWeather(place, async () => ({ ok: false, json: async () => ({}) })),
    ).rejects.toThrow();
    await expect(
      fetchWeather(place, async () => ({ ok: true, json: async () => ({}) })),
    ).rejects.toThrow();
  });

  it('searches places by name', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            name: 'Brno',
            latitude: 49.19,
            longitude: 16.61,
            country: 'Czechia',
            admin1: 'South Moravian',
          },
          { name: 'Broken' },
        ],
      }),
    }));
    expect(await searchPlaces('Brno', 'en', fetchMock)).toEqual([
      { name: 'Brno, South Moravian, Czechia', latitude: 49.19, longitude: 16.61 },
    ]);
    expect(await searchPlaces('B', 'en', fetchMock)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  const makeStore = (initial: Weather | null = null) => {
    let value = initial;
    const store: WeatherStore = { read: () => value, write: (weather) => void (value = weather) };
    return store;
  };
  const cached = (fetchedAt: number): Weather => parseForecast(payload, place, fetchedAt);

  it('uses weather fetched within the last hour without asking again', async () => {
    const fetcher = jest.fn();
    const result = await loadWeather(
      place,
      makeStore(cached(1000)),
      fetcher,
      () => 1000 + 10 * 60_000,
    );
    expect(result.status).toBe('fresh');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches again after an hour and stores the result', async () => {
    const store = makeStore(cached(1000));
    const fetcher = jest.fn(async () => cached(9_999_999));
    const result = await loadWeather(place, store, fetcher, () => 1000 + WEATHER_FRESH_MS + 1);
    expect(result).toMatchObject({ status: 'fresh', weather: { fetchedAt: 9_999_999 } });
    expect(store.read()?.fetchedAt).toBe(9_999_999);
  });

  it('falls back to the earlier weather with its age when offline', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('offline');
    });
    const result = await loadWeather(
      place,
      makeStore(cached(1000)),
      fetcher,
      () => 1000 + 5 * WEATHER_FRESH_MS,
    );
    expect(result).toMatchObject({ status: 'stale', weather: { fetchedAt: 1000 } });
  });

  it('is unavailable when nothing was ever fetched, or only for another place', async () => {
    const fail = async () => {
      throw new Error('offline');
    };
    expect((await loadWeather(place, makeStore(), fail)).status).toBe('unavailable');
    const elsewhere = { name: 'Lisbon', latitude: 38.72, longitude: -9.14 };
    expect((await loadWeather(elsewhere, makeStore(cached(1000)), fail)).status).toBe(
      'unavailable',
    );
    expect((await loadWeather(null, makeStore())).status).toBe('unavailable');
  });
});

describe('suggestions', () => {
  let counter = 0;
  const item = (category: Item['category'], patch: Partial<Item> = {}): Item => ({
    id: `i${++counter}`,
    createdAt: 1,
    ...details({ category }),
    ownership: 'owned',
    originalPath: 'o.jpg',
    cutoutPath: null,
    thumbPath: 't.jpg',
    needsReview: false,
    ...patch,
  });
  const outfitOf = (id: string, items: Item[], patch: Partial<Outfit> = {}): Outfit => ({
    id,
    createdAt: 1,
    name: id,
    notes: null,
    favourite: false,
    seasons: [],
    occasions: [],
    entries: items.map((entry) => ({
      item: entry,
      slot:
        entry.category === 'tops'
          ? 'top'
          : entry.category === 'bottoms'
            ? 'bottom'
            : entry.category === 'outerwear'
              ? 'outer'
              : entry.category === 'dresses'
                ? 'fullBody'
                : 'shoes',
      position: 0,
    })),
    ...patch,
  });
  const weather = (patch: Partial<DayWeather>): DayWeather => ({
    day: '2026-10-02',
    feelsMax: 20,
    feelsMin: 12,
    precipitationChance: 0,
    precipitation: 0,
    wind: 5,
    code: 0,
    ...patch,
  });

  const tank = item('tops', { warmth: 1, name: 'tank' });
  const shorts = item('bottoms', { warmth: 1, name: 'shorts' });
  const shirt = item('tops', { warmth: 2, name: 'shirt' });
  const jeans = item('bottoms', { warmth: 3, name: 'jeans' });
  const jumper = item('tops', { warmth: 4, name: 'jumper' });
  const woolTrousers = item('bottoms', { warmth: 4, name: 'wool trousers' });
  const coat = item('outerwear', { warmth: 5, name: 'coat' });
  const sneakers = item('shoes', { warmth: 2, name: 'sneakers' });

  const summerLook = outfitOf('summer', [tank, shorts, sneakers]);
  const mildLook = outfitOf('mild', [shirt, jeans, sneakers]);
  const winterLook = outfitOf('winter', [jumper, woolTrousers, coat, sneakers]);
  const winterNoCoat = outfitOf('winter-no-coat', [jumper, woolTrousers, sneakers]);
  const all = [summerLook, mildLook, winterLook, winterNoCoat];
  const closet = [tank, shorts, shirt, jeans, jumper, woolTrousers, coat, sneakers];

  const hot = dayProfile('2026-07-15', weather({ feelsMax: 31, feelsMin: 20 }));
  const mild = dayProfile('2026-10-02', weather({ feelsMax: 16, feelsMin: 9 }));
  const coldWet = dayProfile(
    '2026-12-02',
    weather({ feelsMax: 3, feelsMin: -2, precipitationChance: 90, precipitation: 8 }),
  );

  it('turns a forecast into what the day asks for', () => {
    expect(hot).toMatchObject({
      band: 1,
      needsOuter: false,
      rain: false,
      season: 'summer',
      source: 'forecast',
    });
    expect(mild).toMatchObject({ band: 3, needsOuter: false, season: 'autumn' });
    expect(coldWet).toMatchObject({ band: 5, needsOuter: true, rain: true, season: 'winter' });
    expect([30, 20, 12, 5, -3].map(bandFor)).toEqual([1, 2, 3, 4, 5]);
  });

  it('asks for an outer layer in rain or strong wind even when it is not cold', () => {
    const wet = dayProfile(
      '2026-10-02',
      weather({ feelsMax: 16, feelsMin: 10, precipitationChance: 70, precipitation: 4 }),
    );
    expect(wet).toMatchObject({ band: 3, needsOuter: true, rain: true });
    const windy = dayProfile('2026-10-02', weather({ feelsMax: 16, feelsMin: 10, wind: 45 }));
    expect(windy).toMatchObject({ needsOuter: true, rain: false });
    // A light shower that is unlikely does not count as a rainy day.
    const drizzle = dayProfile(
      '2026-10-02',
      weather({ precipitationChance: 30, precipitation: 0.2 }),
    );
    expect(drizzle.rain).toBe(false);
  });

  it('falls back to the season without a forecast', () => {
    expect(dayProfile('2026-01-10', null)).toMatchObject({
      band: 5,
      needsOuter: true,
      source: 'season',
      temperature: null,
    });
    expect(dayProfile('2026-07-10', null)).toMatchObject({
      band: 1,
      needsOuter: false,
      source: 'season',
    });
    expect(dayProfile('2026-01-10', null, true).season).toBe('summer');
  });

  it('on a cold wet day suggests only outfits with an outer layer and none made of light pieces', () => {
    const suggestions = suggest({
      day: '2026-12-02',
      profile: coldWet,
      outfits: all,
      owned: closet,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.items.some((entry) => entry.category === 'outerwear')).toBe(true);
      expect(suggestion.items.every((entry) => (entry.warmth ?? 3) <= 2)).toBe(false);
    }
    expect(suggestions[0].outfit?.id).toBe('winter');
    expect(suggestions[0].reason).toBe('rain');
  });

  it('on a hot day suggests nothing with warm pieces', () => {
    const suggestions = suggest({ day: '2026-07-15', profile: hot, outfits: all, owned: closet });
    expect(suggestions[0].outfit?.id).toBe('summer');
    for (const suggestion of suggestions) {
      expect(suggestion.items.some((entry) => (entry.warmth ?? 3) >= 4)).toBe(false);
    }
    expect(suggestions[0].reason).toBe('hot');
  });

  it('prefers something else over an outfit worn in the last week', () => {
    const second = outfitOf('mild-2', [shirt, jeans, sneakers]);
    const fresh = suggest({
      day: '2026-10-02',
      profile: mild,
      outfits: [mildLook, second],
      owned: [],
    });
    expect(fresh[0].outfit?.id).toBe('mild');
    const history: History = { ...NO_HISTORY, recentOutfitIds: new Set(['mild']) };
    const after = suggest({
      day: '2026-10-02',
      profile: mild,
      outfits: [mildLook, second],
      owned: [],
      history,
    });
    expect(after[0].outfit?.id).toBe('mild-2');
  });

  it('gives favourites an edge', () => {
    const loved = outfitOf('loved', [shirt, jeans, sneakers], { favourite: true });
    const suggestions = suggest({
      day: '2026-10-02',
      profile: mild,
      outfits: [mildLook, loved],
      owned: [],
    });
    expect(suggestions[0].outfit?.id).toBe('loved');
  });

  it('never suggests outfits with wishlist or archived pieces', () => {
    const wished = outfitOf('wished', [item('tops', { warmth: 2, ownership: 'wishlist' }), jeans]);
    const archived = outfitOf('archived', [
      item('tops', { warmth: 2, ownership: 'archived' }),
      jeans,
    ]);
    const suggestions = suggest({
      day: '2026-10-02',
      profile: mild,
      outfits: [wished, archived],
      owned: [],
    });
    expect(suggestions).toEqual([]);
  });

  it('adds new combinations when few saved outfits suit the day, marked as new', () => {
    const suggestions = suggest({
      day: '2026-10-02',
      profile: mild,
      outfits: [mildLook],
      owned: closet,
    });
    expect(suggestions[0].outfit?.id).toBe('mild');
    const generated = suggestions.filter((suggestion) => suggestion.outfit === null);
    expect(generated.length).toBeGreaterThan(0);
    for (const suggestion of generated) {
      const slots = suggestion.pieces.map((piece) => piece.slot);
      expect(slots).toContain('top');
      expect(slots).toContain('bottom');
      expect(slots.filter((slot) => slot === 'shoes').length).toBeLessThanOrEqual(1);
      expect(suggestion.score).toBeGreaterThanOrEqual(RULES.threshold);
    }
  });

  it('gives the same suggestions for the same day', () => {
    const run = () =>
      suggest({ day: '2026-10-02', profile: mild, outfits: [], owned: closet }).map((suggestion) =>
        suggestion.items.map((entry) => entry.id),
      );
    expect(run()).toEqual(run());
  });

  it('still suggests something on a cold day when the closet has no outerwear', () => {
    const noCoat = closet.filter((entry) => entry.category !== 'outerwear');
    const suggestions = suggest({
      day: '2026-12-02',
      profile: coldWet,
      outfits: [winterNoCoat],
      owned: noCoat,
    });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('uses a category default when an item has no warmth', () => {
    const plain = [item('tops'), item('bottoms')];
    expect(scoreItems(plain, mild, NO_HISTORY)).toBeGreaterThanOrEqual(RULES.threshold);
    expect(scoreItems([], mild, NO_HISTORY)).toBe(0);
  });

  it('spots two strong colours that share nothing', () => {
    const red = item('tops', { colours: ['red'] });
    const green = item('bottoms', { colours: ['green'] });
    const black = item('bottoms', { colours: ['black'] });
    expect(clashes(red, green)).toBe(true);
    expect(clashes(red, black)).toBe(false);
    expect(clashes(red, item('bottoms', { colours: ['red', 'white'] }))).toBe(false);
  });

  it('names the reason for a suggestion', () => {
    expect(reasonFor(hot)).toBe('hot');
    expect(reasonFor(mild)).toBe('mild');
    expect(reasonFor(coldWet)).toBe('rain');
    expect(reasonFor(dayProfile('2026-01-10', null))).toBe('season');
  });
});
