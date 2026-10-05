export const GENDERS = ['woman', 'man', 'unspecified'] as const;
export type Gender = (typeof GENDERS)[number];

export const BODY_TYPES = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export function isGender(value: unknown): value is Gender {
  return GENDERS.includes(value as Gender);
}

export function isBodyType(value: unknown): value is BodyType {
  return BODY_TYPES.includes(value as BodyType);
}

export type Profile = {
  id: string;
  name: string;
  gender: Gender | null;
  bodyType: BodyType | null;
  heightCm: number | null;
  sizeTop: string | null;
  sizeBottom: string | null;
  sizeShoes: string | null;
  avatarPath: string | null;
  avatarSmallPath: string | null;
};

export type ProfileInput = Partial<Omit<Profile, 'id'>>;
