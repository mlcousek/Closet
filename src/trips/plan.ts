import { CATEGORIES, CATEGORY_SLOT, type Category, type Occasion } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import type { OutfitPiece } from '@/outfits/draft';
import { daysBetween, type Day } from '@/planning/dates';
import {
  NO_HISTORY,
  generateCombinations,
  seededRandom,
  type DayProfile,
  type Suggestion,
} from '@/planning/suggestions';

/** The numbers that keep a suitcase small. */
export const TRIP_RULES = {
  maxDays: 30,
  /** How many days one piece may be worn, by slot. Unlisted slots have no limit. */
  maxWears: { top: 2, fullBody: 2, bottom: 3 } as Partial<Record<string, number>>,
  /** Pairs of shoes for a trip of up to a week, and for a longer one. */
  shoes: { short: 2, long: 3 },
  /** How much an already packed piece counts for when choosing between outfits. */
  reuseBonus: 10,
};

export type TripError = 'noName' | 'noPlace' | 'endBeforeStart' | 'tooLong' | 'past';

/** Why a trip cannot be created, or null when it can. */
export function validateTrip(input: {
  name: string;
  hasPlace: boolean;
  startDay: Day;
  endDay: Day;
  today: Day;
}): TripError | null {
  if (!input.name.trim()) return 'noName';
  if (!input.hasPlace) return 'noPlace';
  if (input.endDay < input.startDay) return 'endBeforeStart';
  if (input.endDay < input.today) return 'past';
  if (daysBetween(input.startDay, input.endDay) + 1 > TRIP_RULES.maxDays) return 'tooLong';
  return null;
}

export type TripDayInput = { day: Day; profile: DayProfile; activity: Occasion | null };

const keyOf = (pieces: { itemId: string }[]) =>
  pieces
    .map((piece) => piece.itemId)
    .sort()
    .join(',');

/**
 * Picks an outfit for one day from what may still be used: pieces under their
 * wear limit, and only already chosen shoes once the shoe limit is reached.
 * Outfits that reuse packed pieces win when they suit the day about as well.
 */
export function pickDayOutfit(input: {
  tripSeed: string;
  day: TripDayInput;
  owned: Item[];
  /** Pieces chosen for the other days of the trip. */
  others: OutfitPiece[][];
  shoeLimit: number;
  /** Combinations not to offer again, for swapping. */
  exclude?: string[];
  salt?: number;
}): OutfitPiece[] {
  const { day, others } = input;
  const wears = new Map<string, number>();
  for (const pieces of others) {
    for (const piece of pieces) wears.set(piece.itemId, (wears.get(piece.itemId) ?? 0) + 1);
  }
  const slotOf = (item: Item) => CATEGORY_SLOT[item.category];
  const packedShoes = new Set(
    others.flatMap((pieces) =>
      pieces.filter((piece) => piece.slot === 'shoes').map((piece) => piece.itemId),
    ),
  );
  const available = (rules: { activity: boolean; limits: boolean }) =>
    input.owned.filter((item) => {
      if (item.ownership !== 'owned') return false;
      if (
        rules.activity &&
        day.activity &&
        item.occasions.length > 0 &&
        !item.occasions.includes(day.activity)
      ) {
        return false;
      }
      const limit = TRIP_RULES.maxWears[slotOf(item)];
      if (rules.limits && limit !== undefined && (wears.get(item.id) ?? 0) >= limit) return false;
      if (slotOf(item) === 'shoes' && packedShoes.size >= input.shoeLimit) {
        return packedShoes.has(item.id);
      }
      return true;
    });

  const candidates = (items: Item[], profile: DayProfile): Suggestion[] =>
    generateCombinations(
      items,
      profile,
      NO_HISTORY,
      seededRandom(`${input.tripSeed}:${day.day}:${input.salt ?? 0}`),
      6,
    ).filter((candidate) => !(input.exclude ?? []).includes(keyOf(candidate.pieces)));
  // Each attempt gives up one wish, so a small closet still dresses every day: first pieces
  // tagged for other occasions are allowed, then wearing a piece more often than planned,
  // and last going without a coat the closet does not have.
  let options: Suggestion[] = [];
  const profiles = day.profile.needsOuter
    ? [day.profile, { ...day.profile, needsOuter: false }]
    : [day.profile];
  attempts: for (const profile of profiles) {
    for (const rules of [
      { activity: true, limits: true },
      { activity: false, limits: true },
      { activity: false, limits: false },
    ]) {
      options = candidates(available(rules), profile);
      if (options.length > 0) break attempts;
    }
  }
  const value = (candidate: Suggestion) =>
    candidate.score +
    candidate.pieces.filter((piece) => wears.has(piece.itemId)).length * TRIP_RULES.reuseBonus;
  return options.sort((a, b) => value(b) - value(a))[0]?.pieces ?? [];
}

/** Outfits for every day of a trip, chosen in order so later days reuse what earlier days packed. */
export function planTrip(input: {
  tripSeed: string;
  days: TripDayInput[];
  owned: Item[];
  /** Changes the plan, for suggesting everything again. */
  salt?: number;
}): { day: Day; pieces: OutfitPiece[] }[] {
  const shoeLimit = shoeLimitFor(input.days.length);
  const chosen: OutfitPiece[][] = [];
  return input.days.map((day) => {
    const pieces = pickDayOutfit({
      tripSeed: input.tripSeed,
      day,
      owned: input.owned,
      others: chosen,
      shoeLimit,
      salt: input.salt,
    });
    chosen.push(pieces);
    return { day: day.day, pieces };
  });
}

export function shoeLimitFor(dayCount: number): number {
  return dayCount > 7 ? TRIP_RULES.shoes.long : TRIP_RULES.shoes.short;
}

export type PackingGroup = { category: Category; entries: { item: Item; days: Day[] }[] };

/**
 * What to pack: every piece once, grouped by category in closet order, with
 * the days it is worn. Extra items are pieces added by hand, worn on no day.
 */
export function packingList(
  days: { day: Day; pieces: { itemId: string }[] }[],
  items: Item[],
  extraItemIds: string[] = [],
): PackingGroup[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const worn = new Map<string, Day[]>();
  for (const id of extraItemIds) worn.set(id, []);
  for (const { day, pieces } of days) {
    for (const piece of pieces) {
      const list = worn.get(piece.itemId) ?? [];
      if (!list.includes(day)) list.push(day);
      worn.set(piece.itemId, list);
    }
  }
  return CATEGORIES.map((category) => ({
    category,
    entries: [...worn]
      .map(([id, wornOn]) => ({ item: byId.get(id), days: wornOn.sort() }))
      .filter(
        (entry): entry is { item: Item; days: Day[] } =>
          !!entry.item && entry.item.category === category,
      ),
  })).filter((group) => group.entries.length > 0);
}
