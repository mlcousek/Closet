import { CATEGORIES, type Category, type Colour } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { addDays, type Day } from '@/planning/dates';

export const PERIODS = ['30d', '90d', 'year', 'all'] as const;
export type Period = (typeof PERIODS)[number];

const PERIOD_DAYS: Record<Period, number | null> = { '30d': 30, '90d': 90, year: 365, all: null };

/** The first day a period covers, or null when it covers everything. */
export function periodStart(period: Period, today: Day): Day | null {
  const days = PERIOD_DAYS[period];
  return days === null ? null : addDays(today, -(days - 1));
}

export type Wear = { itemId: string; day: Day };

export type ItemWear = { item: Item; wears: number };

export type ClosetStats = {
  /** Owned items; archived and wishlist items are never counted. */
  itemCount: number;
  /** Total purchase value per currency, largest first. */
  value: { currency: string; total: number }[];
  /** Owned items with a price, so the value can say how much of the closet it covers. */
  pricedCount: number;
  byCategory: { category: Category; count: number }[];
  byColour: { colour: Colour; count: number }[];
  /** Wears recorded in the period. */
  wearCount: number;
  mostWorn: ItemWear[];
  /** Items worn in the period, least first. */
  leastWorn: ItemWear[];
  /** Owned items with no wear in the period. */
  neverWorn: Item[];
  /** Share of owned items worn at least once in the period, 0 to 1. */
  usageShare: number;
  /** Best value first: priced items by price per wear over their whole history. */
  costPerWear: { item: Item; wears: number; cost: number }[];
  /** Days with something worn per month, oldest first, for the months the period covers. */
  trend: { month: string; count: number }[];
};

/** Price per wear over an item's whole history; null without a price or without wears. */
export function costPerWear(price: number | null, wears: number): number | null {
  return price !== null && price > 0 && wears > 0 ? price / wears : null;
}

const LIST_LENGTH = 5;

/** Everything the statistics screen shows, from owned items and the wear log. */
export function computeStats(input: {
  items: Item[];
  wears: Wear[];
  period: Period;
  today: Day;
}): ClosetStats {
  const owned = input.items.filter((item) => item.ownership === 'owned');
  const ownedIds = new Set(owned.map((item) => item.id));
  const start = periodStart(input.period, input.today);
  const wears = input.wears.filter((wear) => ownedIds.has(wear.itemId) && wear.day <= input.today);
  const inPeriod = wears.filter((wear) => start === null || wear.day >= start);

  const count = (list: Wear[]) => {
    const counts = new Map<string, number>();
    for (const wear of list) counts.set(wear.itemId, (counts.get(wear.itemId) ?? 0) + 1);
    return counts;
  };
  const periodCounts = count(inPeriod);
  const allCounts = count(wears);

  const totals = new Map<string, number>();
  for (const item of owned) {
    if (item.price === null) continue;
    const currency = item.currency ?? '';
    totals.set(currency, (totals.get(currency) ?? 0) + item.price);
  }

  const colours = new Map<Colour, number>();
  for (const item of owned) {
    for (const colour of item.colours) colours.set(colour, (colours.get(colour) ?? 0) + 1);
  }

  const worn: ItemWear[] = owned
    .filter((item) => periodCounts.has(item.id))
    .map((item) => ({ item, wears: periodCounts.get(item.id)! }));
  const byWears = (a: ItemWear, b: ItemWear) =>
    b.wears - a.wears || a.item.id.localeCompare(b.item.id);

  const months: string[] = [];
  const firstMonth = (start ?? wears.map((wear) => wear.day).sort()[0] ?? input.today).slice(0, 7);
  for (let month = input.today.slice(0, 7); month >= firstMonth && months.length < 13;) {
    months.unshift(month);
    const [year, number] = month.split('-').map(Number);
    month = number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
  }

  return {
    itemCount: owned.length,
    value: [...totals]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => b.total - a.total),
    pricedCount: owned.filter((item) => item.price !== null).length,
    byCategory: CATEGORIES.map((category) => ({
      category,
      count: owned.filter((item) => item.category === category).length,
    }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count),
    byColour: [...colours]
      .map(([colour, total]) => ({ colour, count: total }))
      .sort((a, b) => b.count - a.count || a.colour.localeCompare(b.colour)),
    wearCount: inPeriod.length,
    mostWorn: [...worn].sort(byWears).slice(0, LIST_LENGTH),
    leastWorn: [...worn].sort((a, b) => -byWears(a, b)).slice(0, LIST_LENGTH),
    neverWorn: owned.filter((item) => !periodCounts.has(item.id)),
    usageShare: owned.length === 0 ? 0 : worn.length / owned.length,
    costPerWear: owned
      .map((item) => {
        const itemWears = allCounts.get(item.id) ?? 0;
        const cost = costPerWear(item.price, itemWears);
        return cost === null ? null : { item, wears: itemWears, cost };
      })
      .filter((entry): entry is { item: Item; wears: number; cost: number } => entry !== null)
      .sort((a, b) => a.cost - b.cost),
    trend: months.map((month) => ({
      month,
      count: new Set(inPeriod.filter((wear) => wear.day.startsWith(month)).map((wear) => wear.day))
        .size,
    })),
  };
}
