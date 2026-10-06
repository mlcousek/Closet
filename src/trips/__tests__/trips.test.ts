import type { Category } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { createTestDb } from '@/db/testing';
import { createOutfitRepository } from '@/outfits/repository';
import { createCalendarRepository } from '@/planning/calendar';
import type { DayProfile } from '@/planning/suggestions';
import type { DayWeather } from '@/planning/weather';
import { computeStats, costPerWear, periodStart } from '@/stats/stats';

import { fetchTypical, tripWeather, yearBefore } from '../forecast';
import {
  TRIP_RULES,
  packingList,
  pickDayOutfit,
  planTrip,
  shoeLimitFor,
  validateTrip,
} from '../plan';
import { addTripToCalendar, createTripRepository } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));

const item = (id: string, category: Category, patch: Partial<Item> = {}): Item => ({
  id,
  createdAt: 1,
  name: id,
  category,
  subcategory: null,
  colours: ['black'],
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
  ownership: 'owned',
  originalPath: 'o.jpg',
  cutoutPath: null,
  thumbPath: 't.jpg',
  needsReview: false,
  ...patch,
});

const mild: DayProfile = {
  band: 3,
  needsOuter: false,
  rain: false,
  season: 'spring',
  source: 'forecast',
  temperature: 14,
};

const closet = [
  ...Array.from({ length: 6 }, (_, index) => item(`top-${index}`, 'tops')),
  ...Array.from({ length: 3 }, (_, index) => item(`bottom-${index}`, 'bottoms')),
  ...Array.from({ length: 5 }, (_, index) => item(`shoes-${index}`, 'shoes')),
];

const tripDays = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    day: `2026-11-${String(index + 1).padStart(2, '0')}`,
    profile: mild,
    activity: null,
  }));

describe('statistics', () => {
  const items = [
    item('tee', 'tops', { price: 400, currency: 'CZK', colours: ['white', 'black'] }),
    item('jeans', 'bottoms', { price: 1600, currency: 'CZK' }),
    item('coat', 'outerwear', { price: 100, currency: 'EUR' }),
    item('scarf', 'accessories'),
    item('gone', 'tops', { ownership: 'archived', price: 999, currency: 'CZK' }),
    item('wish', 'tops', { ownership: 'wishlist', price: 999, currency: 'CZK' }),
  ];
  const wears = [
    { itemId: 'tee', day: '2026-10-01' },
    { itemId: 'tee', day: '2026-09-20' },
    { itemId: 'tee', day: '2026-03-01' },
    { itemId: 'tee', day: '2025-01-01' },
    { itemId: 'jeans', day: '2026-10-01' },
    { itemId: 'jeans', day: '2026-06-15' },
    { itemId: 'gone', day: '2026-10-01' },
  ];
  const stats = (period: Parameters<typeof periodStart>[0]) =>
    computeStats({ items, wears, period, today: '2026-10-05' });

  it('counts owned items, their value per currency and the breakdowns', () => {
    const all = stats('all');
    expect(all.itemCount).toBe(4);
    expect(all.value).toEqual([
      { currency: 'CZK', total: 2000 },
      { currency: 'EUR', total: 100 },
    ]);
    expect(all.pricedCount).toBe(3);
    expect(all.byCategory[0]).toEqual({ category: 'tops', count: 1 });
    expect(all.byCategory).toHaveLength(4);
    expect(all.byColour[0]).toEqual({ colour: 'black', count: 4 });
    expect(all.byColour[1]).toEqual({ colour: 'white', count: 1 });
  });

  it('limits wear figures to the period', () => {
    expect(periodStart('30d', '2026-10-05')).toBe('2026-09-06');
    expect(periodStart('all', '2026-10-05')).toBeNull();
    const month = stats('30d');
    expect(month.wearCount).toBe(3);
    expect(month.mostWorn.map((entry) => [entry.item.id, entry.wears])).toEqual([
      ['tee', 2],
      ['jeans', 1],
    ]);
    expect(month.leastWorn[0].item.id).toBe('jeans');
    expect(month.neverWorn.map((entry) => entry.id)).toEqual(['coat', 'scarf']);
    expect(month.usageShare).toBe(0.5);
    expect(month.trend).toEqual([
      { month: '2026-09', count: 1 },
      // Two pieces worn on the same day are one day of wearing.
      { month: '2026-10', count: 1 },
    ]);
    expect(stats('all').wearCount).toBe(6);
    // A rolling year touches thirteen calendar months, and none of its wears is dropped.
    expect(stats('year').trend).toHaveLength(13);
    expect(stats('year').trend[0].month).toBe('2025-10');
  });

  it('works out cost per wear over the whole history, best value first', () => {
    expect(stats('30d').costPerWear.map((entry) => [entry.item.id, entry.cost])).toEqual([
      ['tee', 100],
      ['jeans', 800],
    ]);
    expect(costPerWear(300, 0)).toBeNull();
    expect(costPerWear(null, 3)).toBeNull();
    expect(costPerWear(300, 3)).toBe(100);
  });

  it('copes with an empty closet and an empty wear log', () => {
    const empty = computeStats({ items: [], wears: [], period: 'all', today: '2026-10-05' });
    expect(empty.usageShare).toBe(0);
    expect(empty.trend).toEqual([{ month: '2026-10', count: 0 }]);
    const unworn = computeStats({ items, wears: [], period: '90d', today: '2026-10-05' });
    expect(unworn.neverWorn).toHaveLength(4);
    expect(unworn.mostWorn).toEqual([]);
  });

  it('reads the wear log from the calendar', async () => {
    const { db, sqlite } = await createTestDb();
    sqlite.exec(
      `INSERT INTO wear_events (entry_id, item_id, day) VALUES ('e', 'tee', '2026-10-01')`,
    );
    const calendar = createCalendarRepository(() => db);
    expect(await calendar.wearLog()).toEqual([{ itemId: 'tee', day: '2026-10-01' }]);
  });
});

describe('trip validation', () => {
  const base = {
    name: 'Rome',
    hasPlace: true,
    startDay: '2026-11-01',
    endDay: '2026-11-05',
    today: '2026-10-05',
  };
  it('names what is wrong', () => {
    expect(validateTrip(base)).toBeNull();
    expect(validateTrip({ ...base, name: ' ' })).toBe('noName');
    expect(validateTrip({ ...base, hasPlace: false })).toBe('noPlace');
    expect(validateTrip({ ...base, endDay: '2026-10-31' })).toBe('endBeforeStart');
    expect(validateTrip({ ...base, startDay: '2026-09-01', endDay: '2026-09-03' })).toBe('past');
    expect(validateTrip({ ...base, endDay: '2026-12-15' })).toBe('tooLong');
  });
});

describe('trip outfits', () => {
  it('gives every day an outfit within the reuse limits and the shoe cap', () => {
    const plan = planTrip({ tripSeed: 'trip', days: tripDays(6), owned: closet });
    expect(plan.every((day) => day.pieces.length >= 3)).toBe(true);
    const wears = new Map<string, number>();
    for (const day of plan) {
      for (const piece of day.pieces) wears.set(piece.itemId, (wears.get(piece.itemId) ?? 0) + 1);
    }
    for (const [id, count] of wears) {
      if (id.startsWith('top')) expect(count).toBeLessThanOrEqual(TRIP_RULES.maxWears.top!);
      if (id.startsWith('bottom')) expect(count).toBeLessThanOrEqual(TRIP_RULES.maxWears.bottom!);
    }
    const shoes = [...wears.keys()].filter((id) => id.startsWith('shoes'));
    expect(shoes.length).toBeLessThanOrEqual(shoeLimitFor(6));
    expect(shoeLimitFor(10)).toBe(3);
    // The same trip always gets the same plan.
    expect(planTrip({ tripSeed: 'trip', days: tripDays(6), owned: closet })).toEqual(plan);
  });

  it('wears a piece more often rather than leaving a day without an outfit', () => {
    const small = [item('top', 'tops'), item('bottom', 'bottoms')];
    const plan = planTrip({ tripSeed: 'trip', days: tripDays(4), owned: small });
    expect(plan.map((day) => day.pieces.length)).toEqual([2, 2, 2, 2]);
    expect(planTrip({ tripSeed: 'trip', days: tripDays(2), owned: [item('top', 'tops')] })).toEqual(
      [
        { day: '2026-11-01', pieces: [] },
        { day: '2026-11-02', pieces: [] },
      ],
    );
  });

  it('dresses a cold day fully, with the coat on top', () => {
    const cold: DayProfile = { ...mild, band: 5, needsOuter: true, season: 'winter' };
    const winter = [
      item('jumper', 'tops', { warmth: 5 }),
      item('wool', 'bottoms', { warmth: 4 }),
      item('boots', 'shoes', { warmth: 4 }),
      item('coat', 'outerwear', { warmth: 5 }),
    ];
    const [day] = planTrip({
      tripSeed: 'trip',
      days: [{ day: '2026-12-01', profile: cold, activity: null }],
      owned: winter,
    });
    expect(day.pieces.map((piece) => piece.itemId).sort()).toEqual([
      'boots',
      'coat',
      'jumper',
      'wool',
    ]);
  });

  it('falls back to other pieces when nothing is tagged for the activity', () => {
    const tagged = [
      item('formal-top', 'tops', { occasions: ['formal'] }),
      item('casual-bottom', 'bottoms', { occasions: ['casual'] }),
    ];
    const pieces = pickDayOutfit({
      tripSeed: 'trip',
      day: { day: '2026-11-01', profile: mild, activity: 'formal' },
      owned: tagged,
      others: [],
      shoeLimit: 2,
    });
    expect(pieces.map((piece) => piece.itemId).sort()).toEqual(['casual-bottom', 'formal-top']);
  });

  it('gives another plan when asked again', () => {
    const first = planTrip({ tripSeed: 'trip', days: tripDays(5), owned: closet });
    const rounds = [1, 2, 3].map((salt) =>
      planTrip({ tripSeed: 'trip', days: tripDays(5), owned: closet, salt }),
    );
    expect(rounds.some((plan) => JSON.stringify(plan) !== JSON.stringify(first))).toBe(true);
  });

  it('respects the activity of a day and offers something else on swap', () => {
    const tagged = [
      item('gym-top', 'tops', { occasions: ['sport'] }),
      item('shirt', 'tops', { occasions: ['work'] }),
      item('any-bottom', 'bottoms'),
    ];
    const sport = { day: '2026-11-01', profile: mild, activity: 'sport' as const };
    const first = pickDayOutfit({
      tripSeed: 'trip',
      day: sport,
      owned: tagged,
      others: [],
      shoeLimit: 2,
    });
    expect(first.map((piece) => piece.itemId).sort()).toEqual(['any-bottom', 'gym-top']);

    const free = { ...sport, activity: null };
    const swapped = pickDayOutfit({
      tripSeed: 'trip',
      day: free,
      owned: tagged,
      others: [],
      shoeLimit: 2,
      exclude: ['any-bottom,gym-top'],
      salt: 1,
    });
    expect(swapped.map((piece) => piece.itemId).sort()).toEqual(['any-bottom', 'shirt']);
  });

  it('lists every piece once with the days it is worn', () => {
    const days = [
      { day: '2026-11-02', pieces: [{ itemId: 'top-0' }, { itemId: 'bottom-0' }] },
      { day: '2026-11-01', pieces: [{ itemId: 'top-1' }, { itemId: 'bottom-0' }] },
    ];
    const list = packingList(days, closet, ['shoes-0', 'missing']);
    expect(list.map((group) => group.category)).toEqual(['tops', 'bottoms', 'shoes']);
    expect(list[1].entries).toEqual([
      { item: closet.find((entry) => entry.id === 'bottom-0'), days: ['2026-11-01', '2026-11-02'] },
    ]);
    expect(list[2].entries[0].days).toEqual([]);
  });
});

describe('trip weather', () => {
  const weather = (day: string, feelsMax = 20): DayWeather => ({
    day,
    feelsMax,
    feelsMin: 10,
    precipitationChance: 0,
    precipitation: 0,
    wind: 5,
    code: 1,
  });
  const place = { name: 'Rome', latitude: 41.9, longitude: 12.5 };

  it('finds the same date a year earlier', () => {
    expect(yearBefore('2026-11-03')).toBe('2025-11-03');
    expect(yearBefore('2028-02-29')).toBe('2027-02-28');
  });

  it('reads typical conditions from the archive of the year before', async () => {
    const fetchImpl = jest.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        daily: {
          time: ['2025-12-01', '2025-12-02'],
          apparent_temperature_max: [8, 9],
          apparent_temperature_min: [1, 2],
          precipitation_sum: [4, 0],
          wind_speed_10m_max: [10, 12],
          weather_code: [61, 2],
        },
      }),
    }));
    const typical = await fetchTypical(place, ['2026-12-01', '2026-12-02'], fetchImpl);
    expect(fetchImpl.mock.calls[0][0]).toContain('start_date=2025-12-01&end_date=2025-12-02');
    expect(typical.get('2026-12-01')).toMatchObject({
      day: '2026-12-01',
      feelsMax: 8,
      precipitationChance: 100,
    });
    expect(typical.get('2026-12-02')?.precipitationChance).toBe(0);
  });

  it('uses the forecast for near days and marks far days as typical', async () => {
    const typical = jest.fn(
      async (_place: unknown, days: string[]) =>
        new Map(days.filter((day) => day !== '2026-12-03').map((day) => [day, weather(day, 5)])),
    );
    const result = await tripWeather(place, ['2026-10-06', '2026-12-02', '2026-12-03'], {
      forecast: async () => ({ days: [weather('2026-10-06')] }),
      typical,
    });
    expect(typical.mock.calls[0][1]).toEqual(['2026-12-02', '2026-12-03']);
    expect(result.map((day) => [day.typical, day.weather?.feelsMax ?? null])).toEqual([
      [false, 20],
      [true, 5],
      [false, null],
    ]);
  });

  it('falls back to no weather when nothing can be fetched', async () => {
    const fail = async () => {
      throw new Error('offline');
    };
    const result = await tripWeather(place, ['2026-10-06'], { forecast: fail, typical: fail });
    expect(result).toEqual([{ day: '2026-10-06', weather: null, typical: false }]);
  });
});

describe('trip repository', () => {
  const setup = async () => {
    const { db, query } = await createTestDb();
    const now = () => new Date(2026, 9, 5, 12).getTime();
    return {
      query,
      trips: createTripRepository(() => db, now),
      outfits: createOutfitRepository(() => db, now),
      calendar: createCalendarRepository(() => db, now),
    };
  };
  const place = { name: 'Rome, Italy', latitude: 41.9, longitude: 12.5 };
  const pieces = [
    { itemId: 'top', slot: 'top' as const, position: 0 },
    { itemId: 'bottom', slot: 'bottom' as const, position: 0 },
  ];

  it('creates a trip with one day per date and changes its days', async () => {
    const { trips } = await setup();
    const trip = await trips.create({
      name: ' Rome ',
      place,
      startDay: '2026-10-30',
      endDay: '2026-11-02',
    });
    expect(trip.name).toBe('Rome');
    expect(trip.place).toEqual(place);
    expect(trip.days.map((day) => day.day)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);

    await trips.setDay(trip.id, '2026-10-31', { pieces, activity: 'formal' });
    await trips.setDay(trip.id, '2026-10-31', { outfitId: 'saved' });
    let loaded = (await trips.get(trip.id))!;
    expect(loaded.days[1]).toEqual({
      day: '2026-10-31',
      activity: 'formal',
      pieces,
      outfitId: 'saved',
    });
    // A swapped outfit stays linked: the saved outfit takes the new pieces.
    await trips.setDay(trip.id, '2026-10-31', { pieces: [pieces[0]] });
    loaded = (await trips.get(trip.id))!;
    expect(loaded.days[1].outfitId).toBe('saved');
    expect(loaded.days[1].pieces).toEqual([pieces[0]]);
    expect(loaded.days[1].activity).toBe('formal');
  });

  it('keeps the checklist: ticks, added items and free text', async () => {
    const { trips } = await setup();
    const trip = await trips.create({
      name: 'A',
      place,
      startDay: '2026-11-01',
      endDay: '2026-11-01',
    });
    await trips.setItemPacked(trip.id, 'top', true);
    await trips.addItem(trip.id, 'umbrella');
    await trips.addItem(trip.id, 'top');
    await trips.addText(trip.id, ' Passport ');
    await trips.addText(trip.id, '  ');
    let packing = (await trips.get(trip.id))!.packing;
    expect(packing).toHaveLength(3);
    expect(packing.find((entry) => entry.key === 'top')?.packed).toBe(true);
    const text = packing.find((entry) => entry.kind === 'text')!;
    expect(text).toMatchObject({ label: 'Passport', packed: false });

    await trips.setTextPacked(trip.id, text.key, true);
    await trips.setItemPacked(trip.id, 'top', false);
    await trips.removeEntry(trip.id, 'umbrella');
    packing = (await trips.get(trip.id))!.packing;
    expect(packing.map((entry) => [entry.kind, entry.packed]).sort()).toEqual([
      // The ticked piece that was also added by hand is an extra now.
      ['extra', false],
      ['text', true],
    ]);
  });

  it('lists upcoming trips first', async () => {
    const { trips } = await setup();
    for (const [name, startDay] of [
      ['past', '2026-09-01'],
      ['later', '2026-12-01'],
      ['soon', '2026-10-10'],
    ]) {
      await trips.create({ name, place, startDay, endDay: startDay });
    }
    expect((await trips.list('2026-10-05')).map((trip) => trip.name)).toEqual([
      'soon',
      'later',
      'past',
    ]);
  });

  it('adds the remaining days to the calendar once, and deleting the trip keeps the outfits', async () => {
    const { trips, outfits, calendar, query } = await setup();
    const trip = await trips.create({
      name: 'Rome',
      place,
      startDay: '2026-10-04',
      endDay: '2026-10-07',
    });
    for (const day of ['2026-10-04', '2026-10-06', '2026-10-07']) {
      await trips.setDay(trip.id, day, { pieces });
    }
    const deps = {
      createOutfit: (list: typeof pieces, name: string) => outfits.create(list, { name }),
      outfitExists: async (id: string) => (await outfits.get(id)) !== null,
      plan: (day: string, outfitId: string) => calendar.plan(day, outfitId),
      setDay: trips.setDay,
      today: '2026-10-05',
      nameFor: (day: string) => `Rome ${day}`,
    };
    // The day before today is over, and the day without pieces has nothing to plan.
    expect(await addTripToCalendar((await trips.get(trip.id))!, deps)).toBe(2);
    expect(await addTripToCalendar((await trips.get(trip.id))!, deps)).toBe(0);
    const planned = await calendar.range('2026-10-01', '2026-10-31');
    expect(planned.map((entry) => entry.day)).toEqual(['2026-10-06', '2026-10-07']);
    expect(query('SELECT name FROM outfits ORDER BY name').map((row) => row.name)).toEqual([
      'Rome 2026-10-06',
      'Rome 2026-10-07',
    ]);

    // Swapping a day that is already in the calendar changes its outfit, and adds nothing.
    const linked = (await trips.get(trip.id))!.days[2].outfitId!;
    await trips.setDay(trip.id, '2026-10-06', { pieces: [pieces[0]] });
    expect(await addTripToCalendar((await trips.get(trip.id))!, deps)).toBe(0);
    expect((await outfits.get(linked))?.entries).toHaveLength(0);
    expect(
      query(`SELECT item_id FROM outfit_items WHERE outfit_id = '${linked}'`).map(
        (row) => row.item_id,
      ),
    ).toEqual(['top']);
    expect(await calendar.range('2026-10-01', '2026-10-31')).toHaveLength(2);

    await trips.remove(trip.id);
    expect(await trips.list('2026-10-05')).toEqual([]);
    expect(query('SELECT count(*) AS n FROM outfits WHERE deleted_at IS NULL')[0].n).toBe(2);
    expect(await calendar.range('2026-10-01', '2026-10-31')).toHaveLength(2);
    await trips.restore(trip.id);
    expect((await trips.get(trip.id))?.days[2].outfitId).toBeTruthy();
  });
});
