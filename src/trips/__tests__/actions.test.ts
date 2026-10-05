import type Anthropic from '@anthropic-ai/sdk';

import type { Category } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';

import { generateTrip, styleTrip } from '../actions';
import type { Trip } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({}));
jest.mock('@/db/settings', () => ({ getSetting: () => null, setSetting: () => {} }));

const item = (id: string, category: Category): Item =>
  ({
    id,
    name: id,
    category,
    subcategory: null,
    colours: ['black'],
    seasons: [],
    occasions: [],
    warmth: 3,
    ownership: 'owned',
    thumbPath: 't.jpg',
  }) as unknown as Item;
const closet = [
  item('tee', 'tops'),
  item('shirt', 'tops'),
  item('jeans', 'bottoms'),
  item('boots', 'shoes'),
];

const trip: Trip = {
  id: 'trip',
  name: 'Rome',
  place: { name: 'Rome, Italy', latitude: 41.9, longitude: 12.5 },
  startDay: '2026-11-01',
  endDay: '2026-11-03',
  days: ['2026-11-01', '2026-11-02', '2026-11-03'].map((day) => ({
    day,
    activity: day === '2026-11-02' ? 'formal' : null,
    pieces: [],
    outfitId: null,
  })),
  packing: [],
};
const weather = trip.days.map((day) => ({
  day: day.day,
  typical: false,
  weather: {
    day: day.day,
    feelsMin: 8,
    feelsMax: 16,
    precipitationChance: 0,
    precipitation: 0,
    wind: 5,
    code: 1,
  },
}));

const answer = (outfits: { itemIds: string[]; rationale: string }[]) => {
  const parse = jest.fn(async (_body: unknown) => ({
    stop_reason: 'end_turn',
    parsed_output: { outfits },
  }));
  return { parse, client: { beta: { messages: { parse } } } as unknown as Anthropic };
};
const context = {
  items: closet,
  language: 'en' as const,
  hints: { gender: null, bodyType: null },
};

describe('trip outfits from the stylist', () => {
  it('asks for one outfit per day and stores them in day order, repeats included', async () => {
    const { parse, client } = answer([
      { itemIds: ['tee', 'jeans', 'boots'], rationale: 'a' },
      { itemIds: ['shirt', 'jeans', 'boots'], rationale: 'b' },
      { itemIds: ['jeans', 'tee', 'boots'], rationale: 'c' },
    ]);
    const setDay = jest.fn(async (..._args: unknown[]) => {});
    const onAnswered = jest.fn();
    const filled = await styleTrip(trip, weather, { ...context, onAnswered }, { setDay }, client);

    expect(filled).toBe(3);
    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(setDay.mock.calls.map((call) => call[1])).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    const second = setDay.mock.calls[1][2] as { pieces: { itemId: string }[] };
    expect(second.pieces.map((piece) => piece.itemId)).toEqual(['shirt', 'jeans', 'boots']);

    const body = parse.mock.calls[0][0] as { system: string; messages: { content: string }[] };
    expect(body.system).toContain('Propose 3 different');
    expect(body.messages[0].content).toContain('3-day trip to Rome, Italy');
    expect(body.messages[0].content).toContain('Day 2 (2026-11-02): feels like 14 °C, for formal');
    expect(body.messages[0].content).toContain('at most 2 pairs of shoes');
  });

  it('changes nothing when an outfit did not pass validation', async () => {
    const { client } = answer([
      { itemIds: ['tee', 'jeans'], rationale: 'a' },
      { itemIds: ['tee', 'ghost'], rationale: 'invented' },
      { itemIds: ['shirt', 'jeans'], rationale: 'c' },
    ]);
    const setDay = jest.fn(async (..._args: unknown[]) => {});
    expect(await styleTrip(trip, weather, context, { setDay }, client)).toBe(0);
    expect(setDay).not.toHaveBeenCalled();
  });
});

describe('suggested trip outfits', () => {
  it('stores an outfit for every day from the given weather', async () => {
    const setDay = jest.fn(async (..._args: unknown[]) => {});
    await generateTrip(trip, closet, weather, { setDay });
    expect(setDay).toHaveBeenCalledTimes(3);
    for (const call of setDay.mock.calls) {
      expect((call[2] as { pieces: unknown[] }).pieces.length).toBeGreaterThanOrEqual(2);
    }
  });
});
