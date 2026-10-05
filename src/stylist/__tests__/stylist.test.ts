import type Anthropic from '@anthropic-ai/sdk';

import type { Category } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { createTestDb } from '@/db/testing';
import { createUsageLog } from '@/outfits/renders';

import { createSessionRepository } from '../sessions';
import {
  CATALOGUE_LIMIT,
  buildCatalogue,
  proposeOutfits,
  validateProposals,
  type Proposal,
} from '../stylist';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-secure-store', () => ({}));
const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) =>
    void (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));

const item = (id: string, category: Category, patch: Partial<Item> = {}): Item => ({
  id,
  createdAt: 1,
  name: id,
  category,
  subcategory: null,
  colours: ['black'],
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
  ownership: 'owned',
  originalPath: 'o.jpg',
  cutoutPath: null,
  thumbPath: 't.jpg',
  needsReview: false,
  ...patch,
});

const closet = [
  item('tee', 'tops', { warmth: 1 }),
  item('jumper', 'tops', { warmth: 5 }),
  item('jeans', 'bottoms'),
  item('dress', 'dresses'),
  item('boots', 'shoes'),
  item('trainers', 'shoes'),
  item('coat', 'outerwear'),
  item('wish', 'tops', { ownership: 'wishlist' }),
  item('old', 'tops', { ownership: 'archived' }),
];

const hot = {
  band: 1 as const,
  needsOuter: false,
  rain: false,
  season: 'summer' as const,
  source: 'forecast' as const,
  temperature: 28,
};

describe('catalogue', () => {
  it('describes items in one line each with their wear count', () => {
    const { text, ids } = buildCatalogue(closet.slice(0, 3), {
      wearCounts: new Map([['tee', 4]]),
    });
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('tee | top | tops | tee | black | warmth 1 |  | worn 4x');
    expect(ids.has('jeans')).toBe(true);
  });

  it('leaves out pieces far from the day and keeps a required item', () => {
    // A closet that fits is sent whole, whatever the weather.
    expect(buildCatalogue(closet, { profile: hot }).ids.has('jumper')).toBe(true);

    const big = [
      ...closet,
      ...Array.from({ length: CATALOGUE_LIMIT }, (_, index) =>
        item(`wool-${index}`, 'tops', { warmth: 5 }),
      ),
    ];
    const light = buildCatalogue(big, { profile: hot });
    expect(light.ids.has('jumper')).toBe(false);
    expect(light.ids.has('wool-0')).toBe(false);
    expect(light.ids.has('tee')).toBe(true);
    // Pieces without a warmth are never left out on a guess, and shoes always stay.
    expect(light.ids.has('jeans')).toBe(true);
    expect(light.ids.has('boots')).toBe(true);
    expect(buildCatalogue(big, { profile: hot, mustInclude: ['jumper'] }).ids.has('jumper')).toBe(
      true,
    );
  });

  it('is capped, with a required item first', () => {
    const many = Array.from({ length: CATALOGUE_LIMIT + 20 }, (_, index) =>
      item(`item-${index}`, 'tops'),
    );
    const last = many[many.length - 1].id;
    expect(buildCatalogue(many).ids.size).toBe(CATALOGUE_LIMIT);
    expect(buildCatalogue(many).ids.has(last)).toBe(false);
    expect(buildCatalogue(many, { mustInclude: [last] }).ids.has(last)).toBe(true);
  });
});

describe('validation', () => {
  const check = (itemIds: string[], options = {}) =>
    validateProposals([{ itemIds, rationale: ' fine ' }], closet, options);

  it('accepts a wearable outfit and assigns slots', () => {
    const [proposal] = check(['tee', 'jumper', 'jeans', 'boots', 'coat']);
    expect(proposal.rationale).toBe('fine');
    expect(proposal.pieces).toEqual([
      { itemId: 'tee', slot: 'top', position: 0 },
      { itemId: 'jumper', slot: 'top', position: 1 },
      { itemId: 'jeans', slot: 'bottom', position: 0 },
      { itemId: 'boots', slot: 'shoes', position: 0 },
      { itemId: 'coat', slot: 'outer', position: 0 },
    ]);
  });

  it.each([
    ['an unknown id', ['tee', 'jeans', 'ghost']],
    ['a repeated item', ['tee', 'tee', 'jeans']],
    ['a wishlist item', ['wish', 'jeans']],
    ['an archived item', ['old', 'jeans']],
    ['two pairs of shoes', ['tee', 'jeans', 'boots', 'trainers']],
    ['a dress with a top', ['dress', 'tee']],
    ['a top without a bottom', ['tee', 'boots']],
    ['nothing at all', []],
  ])('rejects %s', (_, ids) => {
    expect(check(ids)).toEqual([]);
  });

  it('drops duplicates of the same outfit and keeps the rest', () => {
    const result = validateProposals(
      [
        { itemIds: ['tee', 'jeans'], rationale: 'a' },
        { itemIds: ['jeans', 'tee'], rationale: 'b' },
        { itemIds: ['dress'], rationale: 'c' },
        { itemIds: ['ghost'], rationale: 'd' },
      ],
      closet,
    );
    expect(result.map((proposal) => proposal.rationale)).toEqual(['a', 'c']);
  });

  it('keeps repeated outfits when a trip asks for one per day', () => {
    const raw = [
      { itemIds: ['tee', 'jeans'], rationale: 'day 1' },
      { itemIds: ['dress'], rationale: 'day 2' },
      { itemIds: ['jeans', 'tee'], rationale: 'day 3' },
    ];
    expect(validateProposals(raw, closet, { keepDuplicates: true })).toHaveLength(3);
    expect(validateProposals(raw, closet)).toHaveLength(2);
  });

  it('requires the chosen item in every proposal, also when it is on the wishlist', () => {
    const options = { mustInclude: 'wish', allowWishlist: 'wish' };
    expect(check(['wish', 'jeans'], options)).toHaveLength(1);
    expect(check(['tee', 'jeans'], options)).toEqual([]);
  });
});

describe('request', () => {
  const answer = (outfits: { itemIds: string[]; rationale: string }[]) => {
    const parse = jest.fn(async (_body: unknown) => ({
      stop_reason: 'end_turn',
      parsed_output: { outfits },
    }));
    return { parse, client: { beta: { messages: { parse } } } as unknown as Anthropic };
  };
  const base = {
    items: closet,
    language: 'cs' as const,
    hints: { gender: 'woman', bodyType: null },
  };

  beforeEach(() => mockSettings.clear());

  it('sends the catalogue and returns only valid proposals', async () => {
    const { parse, client } = answer([
      { itemIds: ['tee', 'jeans', 'boots'], rationale: 'ok' },
      { itemIds: ['tee', 'ghost'], rationale: 'bad' },
    ]);
    const result = await proposeOutfits(
      { ...base, request: 'Dinner', weather: '12 °C, rain' },
      client,
    );
    expect(result).toHaveLength(1);
    const body = parse.mock.calls[0][0] as {
      model: string;
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.system).toContain('Czech');
    expect(body.system).toContain('woman');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toContain('tee | top');
    expect(body.messages[0].content).toContain('Request: Dinner');
    expect(body.messages[0].content).toContain('12 °C, rain');
  });

  it('sends earlier proposals as context for a refinement', async () => {
    const { parse, client } = answer([{ itemIds: ['dress'], rationale: 'ok' }]);
    const earlier: Proposal = {
      rationale: 'first',
      pieces: [
        { itemId: 'tee', slot: 'top', position: 0 },
        { itemId: 'jeans', slot: 'bottom', position: 0 },
      ],
    };
    await proposeOutfits(
      { ...base, request: 'More formal', history: [{ request: 'Dinner', proposals: [earlier] }] },
      client,
    );
    const { messages } = parse.mock.calls[0][0] as {
      messages: { role: string; content: string }[];
    };
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0].content).toContain('Request: Dinner');
    expect(JSON.parse(messages[1].content).outfits[0].itemIds).toEqual(['tee', 'jeans']);
    expect(messages[2].content).toBe('More formal');
  });

  it('tells the model which item is required and enforces it', async () => {
    const { parse, client } = answer([
      { itemIds: ['wish', 'jeans'], rationale: 'with' },
      { itemIds: ['tee', 'jeans'], rationale: 'without' },
    ]);
    const result = await proposeOutfits({ ...base, request: 'Style', mustInclude: 'wish' }, client);
    expect(result.map((proposal) => proposal.rationale)).toEqual(['with']);
    expect((parse.mock.calls[0][0] as { system: string }).system).toContain('id wish');
  });

  it('asks for as many outfits as a trip needs', async () => {
    const { parse, client } = answer([]);
    expect(await proposeOutfits({ ...base, request: 'Trip', count: 5 }, client)).toEqual([]);
    expect((parse.mock.calls[0][0] as { system: string }).system).toContain('Propose 5 different');
  });

  it('reports a refusal and a missing key as unavailable', async () => {
    const parse = jest.fn(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;
    const onAnswered = jest.fn();
    await expect(
      proposeOutfits({ ...base, request: 'x', onAnswered }, client),
    ).rejects.toMatchObject({ reason: 'error' });
    // The provider answered, so the request is counted although nothing usable came back.
    expect(onAnswered).toHaveBeenCalledTimes(1);

    const failing = {
      beta: { messages: { parse: jest.fn().mockRejectedValue(new Error('network')) } },
    } as unknown as Anthropic;
    await expect(
      proposeOutfits({ ...base, request: 'x', onAnswered }, failing),
    ).rejects.toMatchObject({ reason: 'error' });
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });
});

describe('sessions', () => {
  const proposal: Proposal = {
    rationale: 'r',
    pieces: [{ itemId: 'dress', slot: 'fullBody', position: 0 }],
  };

  it('stores turns, lists newest first and deletes with undo', async () => {
    const { db } = await createTestDb();
    let clock = 1000;
    const sessions = createSessionRepository(
      () => db,
      () => clock++,
    );
    const first = await sessions.start({
      request: 'Dinner',
      day: '2026-10-09',
      itemId: null,
      proposals: [proposal],
    });
    const second = await sessions.start({
      request: 'Style this',
      day: null,
      itemId: 'dress',
      proposals: [],
    });
    expect((await sessions.list()).map((session) => session.id)).toEqual([second.id, first.id]);

    const refined = await sessions.addTurn(first.id, { request: 'Warmer', proposals: [proposal] });
    expect(refined?.turns.map((turn) => turn.request)).toEqual(['Dinner', 'Warmer']);
    expect((await sessions.get(first.id))?.turns[1].proposals[0].pieces[0].itemId).toBe('dress');
    expect((await sessions.get(second.id))?.itemId).toBe('dress');

    await sessions.remove(first.id);
    expect(await sessions.list()).toHaveLength(1);
    await sessions.restore(first.id);
    expect(await sessions.list()).toHaveLength(2);
    expect(await sessions.addTurn('missing', { request: 'x', proposals: [] })).toBeNull();

    await sessions.markProposal(first.id, 1, 0, { outfitId: 'o1' });
    await sessions.markProposal(first.id, 1, 0, { planned: true });
    await sessions.markProposal(first.id, 5, 0, { planned: true });
    const marked = (await sessions.get(first.id))!;
    expect(marked.turns[1].proposals[0]).toMatchObject({ outfitId: 'o1', planned: true });
    expect(marked.turns[0].proposals[0].outfitId).toBeUndefined();
  });

  it('counts stylist requests in the usage log', async () => {
    const { db } = await createTestDb();
    const usage = createUsageLog(() => db);
    await usage.record('stylist');
    await usage.record('stylist');
    await usage.record('render');
    expect(await usage.counts('stylist')).toEqual({ month: 2, total: 2 });
  });
});
