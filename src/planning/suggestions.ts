import {
  CATEGORY_SLOT,
  DEFAULT_WARMTH,
  type Colour,
  type Season,
  type Slot,
} from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import type { OutfitPiece } from '@/outfits/draft';
import type { Outfit } from '@/outfits/repository';

import { seasonOf, type Day } from './dates';
import type { DayWeather } from './weather';

/** 1 is hot weather, 5 is freezing. Matches item warmth: band 5 calls for warmth-5 pieces. */
export type Band = 1 | 2 | 3 | 4 | 5;

export type DayProfile = {
  band: Band;
  needsOuter: boolean;
  rain: boolean;
  season: Season;
  /** Whether the profile comes from a forecast or only from the time of year. */
  source: 'forecast' | 'season';
  /** Daytime apparent temperature in Celsius, when a forecast was used. */
  temperature: number | null;
};

/** All tunable numbers of the suggestion rules in one place. */
export const RULES = {
  /** Lower bounds of the apparent temperature for bands 1 to 4; below the last is band 5. */
  bandFrom: [24, 17, 10, 3] as const,
  rainChance: 50,
  rainAmount: 1,
  windy: 35,
  /** Typical band per season when there is no forecast. */
  seasonBand: { summer: 1, spring: 3, autumn: 3, winter: 5 } as Record<Season, Band>,
  score: {
    base: 100,
    perWarmthStep: 18,
    unneededOuter: 30,
    wrongSeason: 20,
    wornRecently: 40,
    itemWornRecently: 8,
    favourite: 10,
    leastWornBonus: 6,
    clash: 15,
  },
  /** Outfits scoring below this are not suggested. */
  threshold: 55,
  /** With fewer suitable saved outfits than this, new combinations are added. */
  minSaved: 3,
  recentDays: 7,
};

export function bandFor(temperature: number): Band {
  const index = RULES.bandFrom.findIndex((from) => temperature >= from);
  return ((index === -1 ? RULES.bandFrom.length : index) + 1) as Band;
}

/** What a day asks of an outfit, from its forecast or, without one, from the season. */
export function dayProfile(day: Day, weather: DayWeather | null, southern = false): DayProfile {
  const season = seasonOf(day, southern);
  if (!weather) {
    const band = RULES.seasonBand[season];
    return {
      band,
      needsOuter: band >= 4,
      rain: false,
      season,
      source: 'season',
      temperature: null,
    };
  }
  // People dress for the day, which sits nearer the maximum than the night-time minimum.
  const temperature = weather.feelsMax * 0.7 + weather.feelsMin * 0.3;
  const band = bandFor(temperature);
  const rain =
    weather.precipitationChance >= RULES.rainChance && weather.precipitation >= RULES.rainAmount;
  return {
    band,
    needsOuter: band >= 4 || rain || (weather.wind >= RULES.windy && band >= 3),
    rain,
    season,
    source: 'forecast',
    temperature,
  };
}

const warmthOf = (item: Item) => item.warmth ?? DEFAULT_WARMTH[item.category];
const slotOf = (item: Item): Slot => CATEGORY_SLOT[item.category];

/** Colours that go with anything. */
const NEUTRALS: Colour[] = ['black', 'white', 'grey', 'beige', 'navy', 'brown'];

/** True when two pieces both have a strong colour and share none: a likely clash. */
export function clashes(a: Item, b: Item): boolean {
  const strong = (item: Item) => item.colours.filter((colour) => !NEUTRALS.includes(colour));
  const first = strong(a);
  const second = strong(b);
  if (first.length === 0 || second.length === 0) return false;
  if (first.includes('multicolour') || second.includes('multicolour')) return false;
  return !first.some((colour) => second.includes(colour));
}

export type History = {
  /** Outfits and items worn within the recent period. */
  recentOutfitIds: Set<string>;
  recentItemIds: Set<string>;
  /** Total wears per item. */
  wearCounts: Map<string, number>;
};

export const NO_HISTORY: History = {
  recentOutfitIds: new Set(),
  recentItemIds: new Set(),
  wearCounts: new Map(),
};

export type Reason = 'hot' | 'warm' | 'mild' | 'cool' | 'cold' | 'rain' | 'season';

export function reasonFor(profile: DayProfile): Reason {
  if (profile.source === 'season') return 'season';
  if (profile.rain) return 'rain';
  return (['hot', 'warm', 'mild', 'cool', 'cold'] as const)[profile.band - 1];
}

/** The score of an outfit that breaks a hard rule for the day. */
export const UNSUITABLE = -Infinity;

/** Scores a set of pieces for a day. Higher is better; below the threshold is unsuitable. */
export function scoreItems(
  items: Item[],
  profile: DayProfile,
  history: History,
  extra: { outfitId?: string; favourite?: boolean; seasons?: Season[] } = {},
): number {
  if (items.length === 0) return 0;
  const weights = RULES.score;
  let score = weights.base;

  // Warmth of what covers the body; shoes, bags and accessories say little about it.
  const body = items.filter((item) => ['top', 'bottom', 'fullBody'].includes(slotOf(item)));
  const hasOuter = items.some((item) => slotOf(item) === 'outer');
  if (body.length > 0) {
    const average = body.reduce((sum, item) => sum + warmthOf(item), 0) / body.length;
    // An outer layer makes up for lighter pieces underneath.
    const effective = hasOuter ? average + 0.5 : average;
    score -= Math.abs(effective - profile.band) * weights.perWarmthStep;
    // Hard limits, which no bonus can outweigh: nothing made only of light pieces on a cold
    // day, with or without a coat over it, and nothing warm on a hot day.
    if (profile.band >= 4 && body.every((item) => warmthOf(item) <= 2)) return UNSUITABLE;
    if (profile.band === 1 && items.some((item) => warmthOf(item) >= 4)) return UNSUITABLE;
  }
  // A day that needs an outer layer never gets an outfit without one.
  if (profile.needsOuter && !hasOuter) return UNSUITABLE;
  if (!profile.needsOuter && hasOuter && profile.band <= 2) score -= weights.unneededOuter;

  const tagged = [...(extra.seasons ?? []), ...items.flatMap((item) => item.seasons)];
  if (tagged.length > 0 && !tagged.includes(profile.season)) score -= weights.wrongSeason;

  if (extra.outfitId && history.recentOutfitIds.has(extra.outfitId)) score -= weights.wornRecently;
  score -=
    items.filter((item) => history.recentItemIds.has(item.id)).length * weights.itemWornRecently;
  if (extra.favourite) score += weights.favourite;

  for (let first = 0; first < items.length; first++) {
    for (let second = first + 1; second < items.length; second++) {
      if (clashes(items[first], items[second])) score -= weights.clash;
    }
  }
  return score;
}

export type Suggestion = {
  /** A saved outfit, or null for a new combination of closet items. */
  outfit: Outfit | null;
  items: Item[];
  pieces: OutfitPiece[];
  score: number;
  reason: Reason;
};

/** True when every piece is owned, so the outfit can be worn today. */
export function isWearable(outfit: Outfit): boolean {
  return (
    outfit.entries.length > 0 && outfit.entries.every((entry) => entry.item.ownership === 'owned')
  );
}

/** A small deterministic random source, so the same day gives the same suggestions. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function pickBest<T>(candidates: T[], scoreOf: (candidate: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreOf(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Assembles new combinations from owned items, slot by slot, greedily by score. */
export function generateCombinations(
  owned: Item[],
  profile: DayProfile,
  history: History,
  random: () => number,
  count: number,
): Suggestion[] {
  const bySlot = (slot: Slot) => owned.filter((item) => slotOf(item) === slot);
  const tops = bySlot('top');
  const bottoms = bySlot('bottom');
  const dresses = bySlot('fullBody');
  const results: Suggestion[] = [];
  const seen = new Set<string>();

  for (let attempt = 0; attempt < count * 6 && results.length < count; attempt++) {
    const chosen: Item[] = [];
    // A little noise makes each attempt start from a different piece.
    const jitter = () => random() * 12;
    const leastWorn = (item: Item) =>
      (history.wearCounts.get(item.id) ?? 0) === 0 ? RULES.score.leastWornBonus : 0;
    const add = (candidates: Item[]) => {
      const pick = pickBest(
        candidates,
        (item) => scoreItems([...chosen, item], profile, history) + leastWorn(item) + jitter(),
      );
      if (pick) chosen.push(pick);
    };

    const canSeparates = tops.length > 0 && bottoms.length > 0;
    if (dresses.length > 0 && (!canSeparates || random() < 0.25)) add(dresses);
    else if (canSeparates) {
      add(tops);
      add(bottoms);
    } else continue;
    add(bySlot('shoes'));
    if (profile.needsOuter) add(bySlot('outer'));

    const key = chosen
      .map((item) => item.id)
      .sort()
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scoreItems(chosen, profile, history);
    if (score < RULES.threshold) continue;
    const positions = new Map<Slot, number>();
    results.push({
      outfit: null,
      items: chosen,
      pieces: chosen.map((item) => {
        const slot = slotOf(item);
        const position = positions.get(slot) ?? 0;
        positions.set(slot, position + 1);
        return { itemId: item.id, slot, position };
      }),
      score,
      reason: reasonFor(profile),
    });
  }
  return results;
}

/**
 * Outfits to wear on a day, best first: saved outfits that suit it, and, when
 * there are few of those, new combinations of closet items.
 */
export function suggest(input: {
  day: Day;
  profile: DayProfile;
  outfits: Outfit[];
  owned: Item[];
  history?: History;
  limit?: number;
}): Suggestion[] {
  const { day, profile, outfits, owned, history = NO_HISTORY, limit = 5 } = input;
  const reason = reasonFor(profile);
  const saved: Suggestion[] = outfits
    .filter(isWearable)
    .map((outfit) => {
      const items = outfit.entries.map((entry) => entry.item);
      return {
        outfit,
        items,
        pieces: outfit.entries.map((entry) => ({
          itemId: entry.item.id,
          slot: entry.slot,
          position: entry.position,
        })),
        score: scoreItems(items, profile, history, {
          outfitId: outfit.id,
          favourite: outfit.favourite,
          seasons: outfit.seasons,
        }),
        reason,
      };
    })
    .filter((suggestion) => suggestion.score >= RULES.threshold)
    .sort((a, b) => b.score - a.score || a.outfit!.id.localeCompare(b.outfit!.id));

  if (saved.length >= RULES.minSaved) return saved.slice(0, limit);
  const savedKeys = new Set(
    saved.map((suggestion) =>
      suggestion.items
        .map((item) => item.id)
        .sort()
        .join(','),
    ),
  );
  const generated = generateCombinations(
    owned.filter((item) => item.ownership === 'owned'),
    profile,
    history,
    seededRandom(day),
    limit,
  ).filter(
    (suggestion) =>
      !savedKeys.has(
        suggestion.items
          .map((item) => item.id)
          .sort()
          .join(','),
      ),
  );
  const all = [...saved, ...generated.sort((a, b) => b.score - a.score)].slice(0, limit);
  // A closet without outerwear still deserves a suggestion on a cold day.
  const hasOuterwear = owned.some((item) => item.ownership === 'owned' && slotOf(item) === 'outer');
  if (all.length === 0 && profile.needsOuter && !hasOuterwear) {
    return suggest({ ...input, profile: { ...profile, needsOuter: false } });
  }
  return all;
}
