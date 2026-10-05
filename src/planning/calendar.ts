import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { calendarEntries, items, outfitItems, wearEvents } from '@/db/schema';

import { addDays, today as todayOf, type Day } from './dates';

export type EntryState = 'planned' | 'worn';

export type CalendarEntry = {
  id: string;
  day: Day;
  outfitId: string;
  state: EntryState;
  position: number;
};

export type WearStats = { count: number; lastWorn: Day | null };

type Row = typeof calendarEntries.$inferSelect;

const toEntry = (row: Row): CalendarEntry => ({
  id: row.id,
  day: row.day,
  outfitId: row.outfitId,
  state: row.state === 'worn' ? 'worn' : 'planned',
  position: row.position,
});

/** Thrown when an outfit is logged as worn on a day that has not come yet. */
export class FutureWearError extends Error {
  constructor() {
    super('An outfit cannot be marked as worn on a future day');
    this.name = 'FutureWearError';
  }
}

export function createCalendarRepository(
  db: () => Db = getDb,
  now: () => number = Date.now,
  today: () => Day = () => todayOf(new Date(now())),
) {
  const base = createRepository(db, calendarEntries, now);
  const active = isNull(calendarEntries.deletedAt);

  const nextPosition = (day: Day): number =>
    (db()
      .select({ value: sql<number | null>`max(${calendarEntries.position})` })
      .from(calendarEntries)
      .where(and(active, eq(calendarEntries.day, day)))
      .get()?.value ?? -1) + 1;

  /** Records one wear per item that the outfit contains right now. */
  const writeWear = (entry: { id: string; outfitId: string; day: Day }) => {
    const itemIds = db()
      .select({ id: outfitItems.itemId })
      .from(outfitItems)
      .innerJoin(items, eq(items.id, outfitItems.itemId))
      .where(and(eq(outfitItems.outfitId, entry.outfitId), isNull(items.deletedAt)))
      .all()
      .map((row) => row.id);
    db().transaction((tx) => {
      tx.delete(wearEvents).where(eq(wearEvents.entryId, entry.id)).run();
      if (itemIds.length > 0) {
        tx.insert(wearEvents)
          .values(itemIds.map((itemId) => ({ entryId: entry.id, itemId, day: entry.day })))
          .run();
      }
    });
  };

  const clearWear = (entryId: string) =>
    db().delete(wearEvents).where(eq(wearEvents.entryId, entryId)).run();

  const requireNotFuture = (day: Day) => {
    if (day > today()) throw new FutureWearError();
  };

  return {
    /** Entries from `from` to `to` inclusive, in day order and then in the order within each day. */
    async range(from: Day, to: Day): Promise<CalendarEntry[]> {
      return db()
        .select()
        .from(calendarEntries)
        .where(and(active, gte(calendarEntries.day, from), lte(calendarEntries.day, to)))
        .orderBy(asc(calendarEntries.day), asc(calendarEntries.position), asc(calendarEntries.id))
        .all()
        .map(toEntry);
    },
    /** Plans an outfit for today or a later day, after any outfits already on that day. */
    async plan(day: Day, outfitId: string): Promise<CalendarEntry> {
      return toEntry(
        await base.create({ day, outfitId, state: 'planned', position: nextPosition(day) }),
      );
    },
    /** Logs an outfit as worn on today or a past day and records a wear for each of its items. */
    async logWorn(day: Day, outfitId: string): Promise<CalendarEntry> {
      requireNotFuture(day);
      const entry = toEntry(
        await base.create({ day, outfitId, state: 'worn', position: nextPosition(day) }),
      );
      writeWear(entry);
      return entry;
    },
    /** Confirms a planned entry as worn. */
    async markWorn(entryId: string): Promise<void> {
      const row = await base.getById(entryId);
      if (!row) return;
      requireNotFuture(row.day);
      await base.update(entryId, { state: 'worn' });
      writeWear({ id: row.id, outfitId: row.outfitId, day: row.day });
    },
    /** Swaps the outfit of an entry, keeping its day and state. */
    async replaceOutfit(entryId: string, outfitId: string): Promise<void> {
      const row = await base.update(entryId, { outfitId });
      if (row?.state === 'worn') writeWear({ id: row.id, outfitId, day: row.day });
    },
    /** Moves an entry to another day. A worn entry cannot be moved into the future. */
    async move(entryId: string, day: Day): Promise<void> {
      const row = await base.getById(entryId);
      if (!row || row.day === day) return;
      if (row.state === 'worn') requireNotFuture(day);
      await base.update(entryId, { day, position: nextPosition(day) });
      if (row.state === 'worn') writeWear({ id: row.id, outfitId: row.outfitId, day });
    },
    /** Removes an entry, and with it the wears it recorded. */
    async remove(entryId: string): Promise<void> {
      await base.softDelete(entryId);
      clearWear(entryId);
    },
    /** Brings a removed entry back, with its wears if it was worn. */
    async restore(entryId: string): Promise<void> {
      await base.restore(entryId);
      const row = await base.getById(entryId);
      if (row?.state === 'worn') writeWear({ id: row.id, outfitId: row.outfitId, day: row.day });
    },
    /**
     * Consecutive days with a worn outfit, ending today, or yesterday when
     * today has none yet, so the streak is not shown as broken in the morning.
     */
    async streak(): Promise<number> {
      const days = new Set(
        db()
          .selectDistinct({ day: calendarEntries.day })
          .from(calendarEntries)
          .where(and(active, eq(calendarEntries.state, 'worn')))
          .all()
          .map((row) => row.day),
      );
      let cursor = today();
      if (!days.has(cursor)) cursor = addDays(cursor, -1);
      let count = 0;
      while (days.has(cursor)) {
        count++;
        cursor = addDays(cursor, -1);
      }
      return count;
    },
    async itemStats(itemId: string): Promise<WearStats> {
      const row = db()
        .select({ count: sql<number>`count(*)`, last: sql<Day | null>`max(${wearEvents.day})` })
        .from(wearEvents)
        .where(eq(wearEvents.itemId, itemId))
        .get();
      return { count: row?.count ?? 0, lastWorn: row?.last ?? null };
    },
    async outfitStats(outfitId: string): Promise<WearStats> {
      const row = db()
        .select({
          count: sql<number>`count(*)`,
          last: sql<Day | null>`max(${calendarEntries.day})`,
        })
        .from(calendarEntries)
        .where(
          and(active, eq(calendarEntries.outfitId, outfitId), eq(calendarEntries.state, 'worn')),
        )
        .get();
      return { count: row?.count ?? 0, lastWorn: row?.last ?? null };
    },
    /** Outfits and items worn from `since` up to and including today, for avoiding repeats. */
    async recentlyWorn(since: Day): Promise<{ outfitIds: Set<string>; itemIds: Set<string> }> {
      const until = today();
      const outfitRows = db()
        .selectDistinct({ id: calendarEntries.outfitId })
        .from(calendarEntries)
        .where(
          and(
            active,
            eq(calendarEntries.state, 'worn'),
            gte(calendarEntries.day, since),
            lte(calendarEntries.day, until),
          ),
        )
        .all();
      const itemRows = db()
        .selectDistinct({ id: wearEvents.itemId })
        .from(wearEvents)
        .where(and(gte(wearEvents.day, since), lte(wearEvents.day, until)))
        .all();
      return {
        outfitIds: new Set(outfitRows.map((row) => row.id)),
        itemIds: new Set(itemRows.map((row) => row.id)),
      };
    },
    /** Total wears per item, for preferring pieces that are worn least. */
    async wearCounts(itemIds: string[]): Promise<Map<string, number>> {
      if (itemIds.length === 0) return new Map();
      const rows = db()
        .select({ id: wearEvents.itemId, count: sql<number>`count(*)` })
        .from(wearEvents)
        .where(inArray(wearEvents.itemId, itemIds))
        .groupBy(wearEvents.itemId)
        .orderBy(desc(sql`count(*)`))
        .all();
      return new Map(rows.map((row) => [row.id, row.count]));
    },
  };
}

export const calendarRepository = createCalendarRepository();
