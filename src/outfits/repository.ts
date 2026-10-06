import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { toItem } from '@/closet/repository';
import {
  SLOTS,
  isOccasion,
  isSeason,
  type Occasion,
  type Season,
  type Slot,
} from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { items, lookbookOutfits, outfitItems, outfits, tripDays } from '@/db/schema';

import type { OutfitPiece } from './draft';

export type OutfitInfo = {
  name: string | null;
  notes: string | null;
  favourite: boolean;
  seasons: Season[];
  occasions: Occasion[];
};

export type OutfitEntry = { item: Item; slot: Slot; position: number };

export type Outfit = OutfitInfo & {
  id: string;
  createdAt: number;
  /** Pieces whose items still exist, in editor order. Archived items stay, marked by their ownership. */
  entries: OutfitEntry[];
};

/** True when an outfit contains a piece the user does not own yet. Such outfits cannot be planned. */
export function hasWishlistItem(outfit: Pick<Outfit, 'entries'>): boolean {
  return outfit.entries.some((entry) => entry.item.ownership === 'wishlist');
}

export type OutfitFilter = { favourite?: boolean; season?: Season; occasion?: Occasion };

type Row = typeof outfits.$inferSelect;

function parseList<T>(json: string, isValid: (value: unknown) => value is T): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

const isSlot = (value: unknown): value is Slot => SLOTS.includes(value as Slot);

/** Fewer pieces than this many slots in the editor order, so entries sort like the editor. */
const SLOT_ORDER: Slot[] = ['outer', 'top', 'fullBody', 'bottom', 'shoes', 'bag', 'accessory'];

export function createOutfitRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, outfits, now);

  /** Entries of the given outfits. Items that were deleted are left out, so undoing a delete brings them back. */
  const entriesFor = (outfitIds: string[]): Map<string, OutfitEntry[]> => {
    const byOutfit = new Map<string, OutfitEntry[]>(outfitIds.map((id) => [id, []]));
    if (outfitIds.length === 0) return byOutfit;
    const rows = db()
      .select({ link: outfitItems, item: items })
      .from(outfitItems)
      .innerJoin(items, eq(items.id, outfitItems.itemId))
      .where(and(inArray(outfitItems.outfitId, outfitIds), isNull(items.deletedAt)))
      .all();
    for (const { link, item } of rows) {
      if (!isSlot(link.slot)) continue;
      byOutfit
        .get(link.outfitId)
        ?.push({ item: toItem(item), slot: link.slot, position: link.position });
    }
    for (const entries of byOutfit.values()) {
      entries.sort(
        (a, b) =>
          SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position,
      );
    }
    return byOutfit;
  };

  const toOutfit = (row: Row, entries: OutfitEntry[]): Outfit => ({
    id: row.id,
    createdAt: row.createdAt,
    name: row.name,
    notes: row.notes,
    favourite: row.favourite,
    seasons: parseList(row.seasons, isSeason),
    occasions: parseList(row.occasions, isOccasion),
    entries,
  });

  const writePieces = (outfitId: string, pieces: OutfitPiece[]) => {
    const seen = new Set<string>();
    const unique = pieces.filter((piece) => !seen.has(piece.itemId) && seen.add(piece.itemId));
    // Both steps or neither, so a failed write can never leave the outfit without pieces.
    db().transaction((tx) => {
      tx.delete(outfitItems).where(eq(outfitItems.outfitId, outfitId)).run();
      if (unique.length > 0) {
        tx.insert(outfitItems)
          .values(unique.map((piece) => ({ outfitId, ...piece })))
          .run();
      }
    });
  };

  const columns = (info: Partial<OutfitInfo>) => {
    const { seasons, occasions, ...rest } = info;
    return {
      ...rest,
      ...(seasons ? { seasons: JSON.stringify(seasons) } : {}),
      ...(occasions ? { occasions: JSON.stringify(occasions) } : {}),
    };
  };

  const get = async (id: string): Promise<Outfit | null> => {
    const row = await base.getById(id);
    return row ? toOutfit(row, entriesFor([id]).get(id) ?? []) : null;
  };

  return {
    get,
    /** Saved outfits, newest first. */
    async list(filter: OutfitFilter = {}): Promise<Outfit[]> {
      const where = [isNull(outfits.deletedAt)];
      if (filter.favourite !== undefined) where.push(eq(outfits.favourite, filter.favourite));
      if (filter.season) {
        where.push(
          sql`EXISTS (SELECT 1 FROM json_each(${outfits.seasons}) WHERE json_each.value = ${filter.season})`,
        );
      }
      if (filter.occasion) {
        where.push(
          sql`EXISTS (SELECT 1 FROM json_each(${outfits.occasions}) WHERE json_each.value = ${filter.occasion})`,
        );
      }
      const rows = db()
        .select()
        .from(outfits)
        .where(and(...where))
        .orderBy(desc(outfits.createdAt), desc(outfits.id))
        .all();
      const entries = entriesFor(rows.map((row) => row.id));
      return rows.map((row) => toOutfit(row, entries.get(row.id) ?? []));
    },
    /** Creates an outfit. An outfit must contain at least one piece. */
    async create(pieces: OutfitPiece[], info: Partial<OutfitInfo> = {}): Promise<Outfit> {
      if (pieces.length === 0) throw new Error('An outfit needs at least one item');
      const row = await base.create(columns(info));
      writePieces(row.id, pieces);
      return (await get(row.id))!;
    },
    /** Replaces the pieces of an outfit. */
    async setPieces(id: string, pieces: OutfitPiece[]): Promise<Outfit | null> {
      if (pieces.length === 0) throw new Error('An outfit needs at least one item');
      if (!(await base.update(id, {}))) return null;
      writePieces(id, pieces);
      return get(id);
    },
    async updateInfo(id: string, info: Partial<OutfitInfo>): Promise<Outfit | null> {
      return (await base.update(id, columns(info))) ? get(id) : null;
    },
    /** A copy of an outfit as a starting point for a new one. */
    async duplicate(id: string): Promise<Outfit | null> {
      const source = await get(id);
      if (!source || source.entries.length === 0) return null;
      const row = await base.create(
        columns({
          name: source.name,
          notes: source.notes,
          seasons: source.seasons,
          occasions: source.occasions,
          favourite: false,
        }),
      );
      writePieces(
        row.id,
        source.entries.map((entry) => ({
          itemId: entry.item.id,
          slot: entry.slot,
          position: entry.position,
        })),
      );
      return get(row.id);
    },
    async remove(id: string): Promise<void> {
      await base.softDelete(id);
    },
    async restore(id: string): Promise<void> {
      await base.restore(id);
    },
    /** How many saved outfits use any of the items. */
    async countUsing(itemIds: string[]): Promise<number> {
      if (itemIds.length === 0) return 0;
      const row = db()
        .select({ value: sql<number>`count(DISTINCT ${outfitItems.outfitId})` })
        .from(outfitItems)
        .innerJoin(outfits, eq(outfits.id, outfitItems.outfitId))
        .where(and(inArray(outfitItems.itemId, itemIds), isNull(outfits.deletedAt)))
        .get();
      return row?.value ?? 0;
    },
    /**
     * Forgets outfits deleted before the cutoff, with their pieces and their
     * place in lookbooks, and returns their ids. Calendar entries stay: the
     * day still shows that something was worn, as a deleted outfit.
     */
    async purgeDeleted(before: number): Promise<string[]> {
      const ids = db()
        .select({ id: outfits.id })
        .from(outfits)
        .where(sql`${outfits.deletedAt} IS NOT NULL AND ${outfits.deletedAt} < ${before}`)
        .all()
        .map((row) => row.id);
      if (ids.length === 0) return [];
      db().transaction((tx) => {
        tx.delete(outfitItems).where(inArray(outfitItems.outfitId, ids)).run();
        tx.delete(lookbookOutfits).where(inArray(lookbookOutfits.outfitId, ids)).run();
        // A trip day that was saved as one of these can be added to the calendar again.
        tx.update(tripDays).set({ outfitId: null }).where(inArray(tripDays.outfitId, ids)).run();
        tx.delete(outfits).where(inArray(outfits.id, ids)).run();
      });
      return ids;
    },
    /** Forgets links to items that have been purged for good. */
    async forgetItems(itemIds: string[]): Promise<void> {
      if (itemIds.length === 0) return;
      db().delete(outfitItems).where(inArray(outfitItems.itemId, itemIds)).run();
      // An outfit left without a single piece could not be shown, edited or rendered.
      const timestamp = now();
      db()
        .update(outfits)
        .set({ deletedAt: timestamp, updatedAt: timestamp })
        .where(
          sql`${outfits.deletedAt} IS NULL AND ${outfits.id} NOT IN (SELECT outfit_id FROM outfit_items)`,
        )
        .run();
    },
  };
}

export const outfitRepository = createOutfitRepository();
