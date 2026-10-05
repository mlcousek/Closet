import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { SLOTS, isOccasion, type Occasion, type Slot } from '@/closet/taxonomy';
import { getDb, type Db } from '@/db/client';
import { newId } from '@/db/id';
import { createRepository } from '@/db/repository';
import { outfitItems, tripDays, tripPacking, trips } from '@/db/schema';
import type { OutfitPiece } from '@/outfits/draft';
import { addDays, daysBetween, today as todayOf, type Day } from '@/planning/dates';
import type { Place } from '@/planning/weather';

/** Query key prefix of everything read from trips. */
export const TRIPS = 'trips';

export type TripDay = {
  day: Day;
  activity: Occasion | null;
  pieces: OutfitPiece[];
  /** The saved outfit of this day, once the trip was added to the calendar. */
  outfitId: string | null;
};

export type PackingEntry = {
  key: string;
  /** 'item' is the tick of an outfit piece, 'extra' a closet item added by hand, 'text' free text. */
  kind: 'item' | 'extra' | 'text';
  label: string | null;
  packed: boolean;
};

export type Trip = {
  id: string;
  name: string;
  place: Place;
  startDay: Day;
  endDay: Day;
  days: TripDay[];
  /** Checklist rows: what was ticked, items added by hand, and free-text entries. */
  packing: PackingEntry[];
};

function parsePieces(json: string): OutfitPiece[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (piece) => typeof piece?.itemId === 'string' && SLOTS.includes(piece?.slot as Slot),
    );
  } catch {
    return [];
  }
}

export function createTripRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, trips, now);

  const load = (row: typeof trips.$inferSelect): Trip => ({
    id: row.id,
    name: row.name,
    place: { name: row.placeName, latitude: row.latitude, longitude: row.longitude },
    startDay: row.startDay,
    endDay: row.endDay,
    days: db()
      .select()
      .from(tripDays)
      .where(eq(tripDays.tripId, row.id))
      .orderBy(asc(tripDays.day))
      .all()
      .map((day) => ({
        day: day.day,
        activity: isOccasion(day.activity) ? day.activity : null,
        pieces: parsePieces(day.pieces),
        outfitId: day.outfitId,
      })),
    packing: db()
      .select()
      .from(tripPacking)
      .where(eq(tripPacking.tripId, row.id))
      .all()
      .map((entry) => ({
        key: entry.key,
        kind: entry.kind === 'text' ? 'text' : entry.kind === 'extra' ? 'extra' : 'item',
        label: entry.label,
        packed: entry.packed,
      })),
  });

  const get = async (id: string): Promise<Trip | null> => {
    const row = await base.getById(id);
    return row ? load(row) : null;
  };

  const upsertPacking = (
    tripId: string,
    entry: { key: string; kind: 'item' | 'text'; label?: string | null; packed: boolean },
  ) =>
    db()
      .insert(tripPacking)
      .values({ tripId, label: null, ...entry })
      .onConflictDoUpdate({
        target: [tripPacking.tripId, tripPacking.key],
        set: { packed: entry.packed },
      })
      .run();

  return {
    get,
    /** Trips that have not ended first, soonest first; then past trips, latest first. */
    async list(today: Day = todayOf()): Promise<Trip[]> {
      const all = db()
        .select()
        .from(trips)
        .where(isNull(trips.deletedAt))
        .orderBy(desc(trips.startDay))
        .all()
        .map(load);
      const upcoming = all.filter((trip) => trip.endDay >= today).reverse();
      return [...upcoming, ...all.filter((trip) => trip.endDay < today)];
    },
    /** Creates a trip with one empty day per date. */
    async create(input: { name: string; place: Place; startDay: Day; endDay: Day }): Promise<Trip> {
      const row = await base.create({
        name: input.name.trim(),
        placeName: input.place.name,
        latitude: input.place.latitude,
        longitude: input.place.longitude,
        startDay: input.startDay,
        endDay: input.endDay,
      });
      const count = daysBetween(input.startDay, input.endDay) + 1;
      db()
        .insert(tripDays)
        .values(
          Array.from({ length: count }, (_, index) => ({
            tripId: row.id,
            day: addDays(input.startDay, index),
          })),
        )
        .run();
      return load(row);
    },
    /** Changes the outfit, the activity or the saved outfit of one day. */
    async setDay(
      tripId: string,
      day: Day,
      patch: { pieces?: OutfitPiece[]; activity?: Occasion | null; outfitId?: string | null },
    ): Promise<void> {
      const { pieces, ...rest } = patch;
      const where = and(eq(tripDays.tripId, tripId), eq(tripDays.day, day));
      const linked = db().select({ outfitId: tripDays.outfitId }).from(tripDays).where(where).get();
      if (pieces && pieces.length > 0 && linked?.outfitId) {
        // The day is already in the calendar: its saved outfit follows the change, so the
        // calendar never shows an outfit the trip no longer has, and none is created twice.
        const outfitId = linked.outfitId;
        db().transaction((tx) => {
          tx.delete(outfitItems).where(eq(outfitItems.outfitId, outfitId)).run();
          tx.insert(outfitItems)
            .values(pieces.map((piece) => ({ outfitId, ...piece })))
            .run();
        });
      }
      db()
        .update(tripDays)
        .set({
          ...rest,
          ...(pieces ? { pieces: JSON.stringify(pieces) } : {}),
        })
        .where(where)
        .run();
    },
    /** Ticks or unticks a closet item on the checklist. */
    async setItemPacked(tripId: string, itemId: string, packed: boolean): Promise<void> {
      upsertPacking(tripId, { key: itemId, kind: 'item', packed });
    },
    /** Adds a closet item that is not part of any outfit. */
    async addItem(tripId: string, itemId: string): Promise<void> {
      db()
        .insert(tripPacking)
        .values({ tripId, key: itemId, kind: 'extra', label: null, packed: false })
        // An item that was only ticked so far becomes an extra and keeps its tick.
        .onConflictDoUpdate({
          target: [tripPacking.tripId, tripPacking.key],
          set: { kind: 'extra' },
        })
        .run();
    },
    /** Adds a free-text entry such as "passport". */
    async addText(tripId: string, label: string): Promise<void> {
      const text = label.trim();
      if (!text) return;
      upsertPacking(tripId, { key: newId(), kind: 'text', label: text, packed: false });
    },
    async setTextPacked(tripId: string, key: string, packed: boolean): Promise<void> {
      db()
        .update(tripPacking)
        .set({ packed })
        .where(and(eq(tripPacking.tripId, tripId), eq(tripPacking.key, key)))
        .run();
    },
    async removeEntry(tripId: string, key: string): Promise<void> {
      db()
        .delete(tripPacking)
        .where(and(eq(tripPacking.tripId, tripId), eq(tripPacking.key, key)))
        .run();
    },
    /** Deletes the trip. Outfits saved from it stay, as do their calendar entries. */
    async remove(id: string): Promise<void> {
      await base.softDelete(id);
    },
    async restore(id: string): Promise<void> {
      await base.restore(id);
    },
  };
}

export type TripRepository = ReturnType<typeof createTripRepository>;

export const tripRepository = createTripRepository();

/**
 * Saves the outfit of each remaining day of a trip and plans it in the
 * calendar. Days that are over, have no outfit, or were added before are
 * skipped. Returns how many days were added.
 */
export async function addTripToCalendar(
  trip: Trip,
  deps: {
    createOutfit(pieces: OutfitPiece[], name: string): Promise<{ id: string }>;
    plan(day: Day, outfitId: string): Promise<unknown>;
    setDay: TripRepository['setDay'];
    today: Day;
    nameFor(day: Day): string;
  },
): Promise<number> {
  let added = 0;
  for (const day of trip.days) {
    if (day.outfitId || day.pieces.length === 0 || day.day < deps.today) continue;
    const outfit = await deps.createOutfit(day.pieces, deps.nameFor(day.day));
    // Linked before planning, so a failure in between cannot create the outfit twice.
    await deps.setDay(trip.id, day.day, { outfitId: outfit.id });
    await deps.plan(day.day, outfit.id);
    added++;
  }
  return added;
}
