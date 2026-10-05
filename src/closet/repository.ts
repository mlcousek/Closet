import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { items } from '@/db/schema';

import {
  isCategory,
  isColour,
  isOccasion,
  isSeason,
  isSubcategoryOf,
  isWarmth,
  type Category,
} from './taxonomy';
import type { Item, ItemDetails, ItemFilter, ItemImages, Ownership } from './types';

type Row = typeof items.$inferSelect;

function parseList<T>(json: string, isValid: (value: unknown) => value is T): T[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

export function toItem(row: Row): Item {
  // Rows always have a known category; an unknown one can only come from a newer app version.
  const category: Category = isCategory(row.category) ? row.category : 'accessories';
  return {
    id: row.id,
    createdAt: row.createdAt,
    name: row.name,
    category,
    subcategory: isSubcategoryOf(category, row.subcategory) ? row.subcategory : null,
    colours: parseList(row.colours, isColour),
    seasons: parseList(row.seasons, isSeason),
    occasions: parseList(row.occasions, isOccasion),
    warmth: isWarmth(row.warmth) ? row.warmth : null,
    brand: row.brand,
    size: row.size,
    price: row.price,
    currency: row.currency,
    purchasedAt: row.purchasedAt,
    notes: row.notes,
    sourceUrl: row.sourceUrl,
    ownership: row.ownership === 'archived' ? 'archived' : 'owned',
    originalPath: row.originalPath,
    cutoutPath: row.cutoutPath,
    thumbPath: row.thumbPath,
    needsReview: row.needsReview,
  };
}

function toColumns(details: Partial<ItemDetails>) {
  const { colours, seasons, occasions, ...rest } = details;
  return {
    ...rest,
    ...(colours ? { colours: JSON.stringify(colours) } : {}),
    ...(seasons ? { seasons: JSON.stringify(seasons) } : {}),
    ...(occasions ? { occasions: JSON.stringify(occasions) } : {}),
  };
}

/** Matches rows whose JSON array column contains any of the values. */
function anyOf(column: AnySQLiteColumn, values: string[]): SQL {
  return sql`EXISTS (SELECT 1 FROM json_each(${column}) WHERE json_each.value IN (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}))`;
}

function conditions(filter: ItemFilter): SQL[] {
  const where: SQL[] = [isNull(items.deletedAt), eq(items.ownership, filter.ownership ?? 'owned')];
  if (filter.category) where.push(eq(items.category, filter.category));
  if (filter.colours?.length) where.push(anyOf(items.colours, filter.colours));
  if (filter.seasons?.length) where.push(anyOf(items.seasons, filter.seasons));
  if (filter.occasions?.length) where.push(anyOf(items.occasions, filter.occasions));
  if (filter.brand) where.push(eq(items.brand, filter.brand));
  if (filter.needsReview !== undefined) where.push(eq(items.needsReview, filter.needsReview));
  return where;
}

function ordering(sort: ItemFilter['sort']): SQL[] {
  switch (sort) {
    case 'name':
      // Unnamed items go last.
      return [sql`${items.name} IS NULL`, sql`${items.name} COLLATE NOCASE`, desc(items.createdAt)];
    case 'brand':
      return [
        sql`${items.brand} IS NULL`,
        sql`${items.brand} COLLATE NOCASE`,
        desc(items.createdAt),
      ];
    case 'price':
      return [sql`${items.price} IS NULL`, desc(items.price), desc(items.createdAt)];
    default:
      return [desc(items.createdAt), asc(items.id)];
  }
}

export function createItemRepository(db: () => Db = getDb, now: () => number = Date.now) {
  const base = createRepository(db, items, now);

  const setOwnership = (ids: string[], ownership: Ownership) => {
    if (ids.length === 0) return;
    db().update(items).set({ ownership, updatedAt: now() }).where(inArray(items.id, ids)).run();
  };

  return {
    async list(filter: ItemFilter = {}): Promise<Item[]> {
      return db()
        .select()
        .from(items)
        .where(and(...conditions(filter)))
        .orderBy(...ordering(filter.sort))
        .all()
        .map(toItem);
    },
    async get(id: string): Promise<Item | null> {
      const row = await base.getById(id);
      return row ? toItem(row) : null;
    },
    /** Number of items matching a filter. */
    async count(filter: ItemFilter = {}): Promise<number> {
      const row = db()
        .select({ value: sql<number>`count(*)` })
        .from(items)
        .where(and(...conditions(filter)))
        .get();
      return row?.value ?? 0;
    },
    /** Distinct brands of owned items, for the brand filter. */
    async brands(): Promise<string[]> {
      return db()
        .selectDistinct({ brand: items.brand })
        .from(items)
        .where(and(isNull(items.deletedAt), eq(items.ownership, 'owned'), isNotNull(items.brand)))
        .orderBy(sql`${items.brand} COLLATE NOCASE`)
        .all()
        .map((row) => row.brand as string);
    },
    async create(
      details: ItemDetails,
      images: ItemImages,
      options: { needsReview?: boolean; id?: string } = {},
    ): Promise<Item> {
      const row = await base.create({
        ...toColumns(details),
        ...images,
        ...(options.id ? { id: options.id } : {}),
        category: details.category,
        ownership: 'owned',
        needsReview: options.needsReview ?? false,
      });
      return toItem(row);
    },
    async update(
      id: string,
      patch: Partial<ItemDetails> & Partial<ItemImages> & { needsReview?: boolean },
    ): Promise<Item | null> {
      const { originalPath, cutoutPath, thumbPath, needsReview, ...details } = patch;
      const row = await base.update(id, {
        ...toColumns(details),
        ...(originalPath !== undefined ? { originalPath } : {}),
        ...(cutoutPath !== undefined ? { cutoutPath } : {}),
        ...(thumbPath !== undefined ? { thumbPath } : {}),
        ...(needsReview !== undefined ? { needsReview } : {}),
      });
      return row ? toItem(row) : null;
    },
    /** Applies the same detail values to several items, for bulk re-tagging. */
    async updateMany(ids: string[], patch: Partial<ItemDetails>): Promise<void> {
      if (ids.length === 0) return;
      db()
        .update(items)
        .set({ ...toColumns(patch), updatedAt: now() })
        .where(and(inArray(items.id, ids), isNull(items.deletedAt)))
        .run();
    },
    async archive(ids: string[]): Promise<void> {
      setOwnership(ids, 'archived');
    },
    async unarchive(ids: string[]): Promise<void> {
      setOwnership(ids, 'owned');
    },
    /** Hides items; restore brings them back within the undo period. */
    async remove(ids: string[]): Promise<void> {
      for (const id of ids) await base.softDelete(id);
    },
    async restore(ids: string[]): Promise<void> {
      for (const id of ids) await base.restore(id);
    },
    /**
     * Items deleted before the cutoff, whose images can now be removed for good.
     * Returns the rows and forgets them.
     */
    async purgeDeleted(before: number): Promise<Item[]> {
      const rows = db()
        .select()
        .from(items)
        .where(and(isNotNull(items.deletedAt), sql`${items.deletedAt} < ${before}`))
        .all();
      if (rows.length > 0) {
        db()
          .delete(items)
          .where(
            inArray(
              items.id,
              rows.map((row) => row.id),
            ),
          )
          .run();
      }
      return rows.map(toItem);
    },
  };
}

export const itemRepository = createItemRepository();
