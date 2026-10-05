import { eq } from 'drizzle-orm';

import { getDb } from './client';
import { appSettings } from './schema';

export function getSetting(key: string): string | null {
  const row = getDb().select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  const db = getDb();
  if (value === null) {
    db.delete(appSettings).where(eq(appSettings.key, key)).run();
    return;
  }
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}
