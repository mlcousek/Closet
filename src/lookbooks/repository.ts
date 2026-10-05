import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { lookbookOutfits, lookbooks, outfits } from '@/db/schema';

export type Lookbook = {
  id: string;
  createdAt: number;
  name: string;
  description: string | null;
  /** Ids of the outfits that still exist, in the user's order. */
  outfitIds: string[];
  /** The outfit shown as the cover: the chosen one while it is in the lookbook, otherwise the first. */
  coverOutfitId: string | null;
};

type Row = typeof lookbooks.$inferSelect;

export function createLookbookRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, lookbooks, now);

  /** Outfit ids per lookbook, ordered, leaving out outfits that have been deleted. */
  const outfitIdsFor = (lookbookIds: string[]): Map<string, string[]> => {
    const byLookbook = new Map<string, string[]>(lookbookIds.map((id) => [id, []]));
    if (lookbookIds.length === 0) return byLookbook;
    const rows = db()
      .select({ lookbookId: lookbookOutfits.lookbookId, outfitId: lookbookOutfits.outfitId })
      .from(lookbookOutfits)
      .innerJoin(outfits, eq(outfits.id, lookbookOutfits.outfitId))
      .where(and(inArray(lookbookOutfits.lookbookId, lookbookIds), isNull(outfits.deletedAt)))
      .orderBy(asc(lookbookOutfits.position), asc(lookbookOutfits.outfitId))
      .all();
    for (const row of rows) byLookbook.get(row.lookbookId)?.push(row.outfitId);
    return byLookbook;
  };

  const toLookbook = (row: Row, outfitIds: string[]): Lookbook => ({
    id: row.id,
    createdAt: row.createdAt,
    name: row.name,
    description: row.description,
    outfitIds,
    coverOutfitId:
      row.coverOutfitId && outfitIds.includes(row.coverOutfitId)
        ? row.coverOutfitId
        : (outfitIds[0] ?? null),
  });

  const get = async (id: string): Promise<Lookbook | null> => {
    const row = await base.getById(id);
    return row ? toLookbook(row, outfitIdsFor([id]).get(id) ?? []) : null;
  };

  /** Rewrites the positions of a lookbook's outfits to match the given order. */
  const writeOrder = (lookbookId: string, orderedIds: string[]) => {
    db().transaction((tx) => {
      orderedIds.forEach((outfitId, position) => {
        tx.update(lookbookOutfits)
          .set({ position })
          .where(
            and(eq(lookbookOutfits.lookbookId, lookbookId), eq(lookbookOutfits.outfitId, outfitId)),
          )
          .run();
      });
    });
  };

  return {
    get,
    /** All lookbooks, oldest first, so new ones appear at the end of the row. */
    async list(): Promise<Lookbook[]> {
      const rows = db()
        .select()
        .from(lookbooks)
        .where(isNull(lookbooks.deletedAt))
        .orderBy(asc(lookbooks.createdAt), asc(lookbooks.id))
        .all();
      const ids = outfitIdsFor(rows.map((row) => row.id));
      return rows.map((row) => toLookbook(row, ids.get(row.id) ?? []));
    },
    async create(name: string, description: string | null = null): Promise<Lookbook> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('A lookbook needs a name');
      const row = await base.create({ name: trimmed, description: description?.trim() || null });
      return toLookbook(row, []);
    },
    async rename(id: string, name: string, description?: string | null): Promise<Lookbook | null> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('A lookbook needs a name');
      const updated = await base.update(id, {
        name: trimmed,
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      });
      return updated ? get(id) : null;
    },
    /** Removes the lookbook. Its outfits are not touched. */
    async remove(id: string): Promise<void> {
      await base.softDelete(id);
    },
    async restore(id: string): Promise<void> {
      await base.restore(id);
    },
    /** Adds outfits at the end; outfits already in the lookbook stay where they are. */
    async addOutfits(id: string, outfitIds: string[]): Promise<void> {
      if (outfitIds.length === 0) return;
      db().transaction((tx) => {
        const last =
          tx
            .select({ value: sql<number | null>`max(${lookbookOutfits.position})` })
            .from(lookbookOutfits)
            .where(eq(lookbookOutfits.lookbookId, id))
            .get()?.value ?? -1;
        tx.insert(lookbookOutfits)
          .values(
            [...new Set(outfitIds)].map((outfitId, index) => ({
              lookbookId: id,
              outfitId,
              position: last + 1 + index,
            })),
          )
          .onConflictDoNothing()
          .run();
      });
    },
    /** Takes an outfit out of the lookbook. The outfit itself stays. */
    async removeOutfit(id: string, outfitId: string): Promise<void> {
      db()
        .delete(lookbookOutfits)
        .where(and(eq(lookbookOutfits.lookbookId, id), eq(lookbookOutfits.outfitId, outfitId)))
        .run();
    },
    /** Moves an outfit to a new place in the lookbook's order (0 is first). */
    async moveOutfit(id: string, outfitId: string, toIndex: number): Promise<void> {
      const order = outfitIdsFor([id]).get(id) ?? [];
      const from = order.indexOf(outfitId);
      if (from === -1) return;
      order.splice(from, 1);
      order.splice(Math.max(0, Math.min(order.length, toIndex)), 0, outfitId);
      writeOrder(id, order);
    },
    async setCover(id: string, outfitId: string | null): Promise<void> {
      await base.update(id, { coverOutfitId: outfitId });
    },
    /** Ids of the lookbooks an outfit is in. */
    async containing(outfitId: string): Promise<string[]> {
      return db()
        .select({ id: lookbookOutfits.lookbookId })
        .from(lookbookOutfits)
        .innerJoin(lookbooks, eq(lookbooks.id, lookbookOutfits.lookbookId))
        .where(and(eq(lookbookOutfits.outfitId, outfitId), isNull(lookbooks.deletedAt)))
        .all()
        .map((row) => row.id);
    },
  };
}

export const lookbookRepository = createLookbookRepository();
