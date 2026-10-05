import { getDb, type Db } from '@/db/client';
import { createRepository } from '@/db/repository';
import { profiles } from '@/db/schema';

import { isBodyType, isGender, type Profile, type ProfileInput } from './types';

type Row = typeof profiles.$inferSelect;

function toProfile(row: Row): Profile {
  return {
    id: row.id,
    name: row.name,
    gender: isGender(row.gender) ? row.gender : null,
    bodyType: isBodyType(row.bodyType) ? row.bodyType : null,
    heightCm: row.heightCm,
    sizeTop: row.sizeTop,
    sizeBottom: row.sizeBottom,
    sizeShoes: row.sizeShoes,
    avatarPath: row.avatarPath,
    avatarSmallPath: row.avatarSmallPath,
    avatarStudioPath: row.avatarStudioPath,
  };
}

export function createProfileRepository(db: () => Db = getDb, now?: () => number) {
  const base = createRepository(db, profiles, now);

  const get = async (): Promise<Profile | null> => {
    const [row] = await base.list();
    return row ? toProfile(row) : null;
  };

  return {
    /** The profile of this device's user, or null before onboarding. */
    get,
    /** Creates the profile on first use and updates it afterwards. */
    async save(input: ProfileInput): Promise<Profile> {
      const existing = await get();
      if (existing) {
        const updated = await base.update(existing.id, input);
        return toProfile(updated!);
      }
      const name = input.name?.trim();
      if (!name) throw new Error('A profile needs a name');
      return toProfile(await base.create({ ...input, name }));
    },
  };
}

export const profileRepository = createProfileRepository();
