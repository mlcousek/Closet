import { and, eq, isNull, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { Db } from './client';
import { newId } from './id';

type BaseTable = SQLiteTable & {
  id: SQLiteColumn;
  createdAt: SQLiteColumn;
  updatedAt: SQLiteColumn;
  deletedAt: SQLiteColumn;
};

type Managed = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt';

export type Repository<T extends BaseTable> = {
  create(values: Omit<InferInsertModel<T>, Managed> & { id?: string }): Promise<InferSelectModel<T>>;
  update(
    id: string,
    patch: Partial<Omit<InferInsertModel<T>, Managed>>,
  ): Promise<InferSelectModel<T> | undefined>;
  /** Hides the record from lists; it can be brought back with restore. */
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  getById(id: string): Promise<InferSelectModel<T> | undefined>;
  list(): Promise<InferSelectModel<T>[]>;
};

/**
 * Shared data access for tables built on baseColumns. Features use repositories
 * instead of the database directly so a remote implementation can replace this later.
 */
export function createRepository<T extends BaseTable>(
  getDb: () => Db,
  table: T,
  now: () => number = Date.now,
): Repository<T> {
  // Drizzle's generics do not narrow through a table type parameter, so queries are built untyped here
  // and the public signatures above carry the types.
  const t = table as any;
  const db = () => getDb() as any;

  const getById = async (id: string) =>
    db()
      .select()
      .from(t)
      .where(and(eq(t.id, id), isNull(t.deletedAt)))
      .get();

  return {
    async create(values) {
      const timestamp = now();
      const id = values.id ?? newId();
      db()
        .insert(t)
        .values({ ...values, id, createdAt: timestamp, updatedAt: timestamp, deletedAt: null })
        .run();
      return getById(id);
    },
    async update(id, patch) {
      db()
        .update(t)
        .set({ ...patch, updatedAt: now() })
        .where(and(eq(t.id, id), isNull(t.deletedAt)))
        .run();
      return getById(id);
    },
    async softDelete(id) {
      const timestamp = now();
      db().update(t).set({ deletedAt: timestamp, updatedAt: timestamp }).where(eq(t.id, id)).run();
    },
    async restore(id) {
      db().update(t).set({ deletedAt: null, updatedAt: now() }).where(eq(t.id, id)).run();
    },
    getById,
    async list() {
      return db().select().from(t).where(isNull(t.deletedAt)).all();
    },
  };
}
