import { createTestDb } from '@/db/testing';

import { assessAvatar, discardAvatar, smallSize, storeAvatar, type AvatarDeps } from '../avatar';
import { dayPart, greetingKey } from '../greeting';
import { createProfileRepository } from '../repository';
import { cmToFeetInches, feetInchesToCm, formatHeight, lengthSystem, parseHeight } from '../units';

jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));
jest.mock('expo-sqlite', () => ({}));

describe('profile repository', () => {
  const setup = async () => {
    const { db } = await createTestDb();
    return createProfileRepository(() => db);
  };

  it('has no profile before onboarding', async () => {
    const repo = await setup();
    expect(await repo.get()).toBeNull();
  });

  it('creates the profile on first save, leaving skipped values unset', async () => {
    const repo = await setup();
    const saved = await repo.save({ name: '  Auri ' });
    expect(saved).toMatchObject({
      name: 'Auri',
      gender: null,
      bodyType: null,
      heightCm: null,
      avatarPath: null,
    });
    expect(await repo.get()).toEqual(saved);
  });

  it('requires a name to create the profile', async () => {
    const repo = await setup();
    await expect(repo.save({ gender: 'woman' })).rejects.toThrow();
    await expect(repo.save({ name: '   ' })).rejects.toThrow();
    expect(await repo.get()).toBeNull();
  });

  it('updates the same profile on later saves', async () => {
    const repo = await setup();
    const created = await repo.save({ name: 'Auri', gender: 'woman', bodyType: 'average' });
    const updated = await repo.save({
      bodyType: 'curvy',
      heightCm: 168,
      sizeTop: 'S',
      sizeShoes: '38',
      avatarPath: 'images/avatar/a.jpg',
      avatarSmallPath: 'images/avatar/b.jpg',
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: 'Auri',
      gender: 'woman',
      bodyType: 'curvy',
      heightCm: 168,
      sizeTop: 'S',
      sizeShoes: '38',
      avatarPath: 'images/avatar/a.jpg',
    });
  });

  it('can clear values again', async () => {
    const repo = await setup();
    await repo.save({ name: 'Auri', gender: 'man', avatarPath: 'images/avatar/a.jpg' });
    const cleared = await repo.save({ gender: null, avatarPath: null });
    expect(cleared).toMatchObject({ gender: null, avatarPath: null });
  });

  it('ignores stored values that are not known options', async () => {
    const repo = await setup();
    await repo.save({ name: 'Auri', gender: 'robot' as never, bodyType: 'huge' as never });
    expect(await repo.get()).toMatchObject({ gender: null, bodyType: null });
  });
});

describe('avatar photo check', () => {
  const person = { x: 0.3, y: 0.1, width: 0.4, height: 0.8, confidence: 0.9 };

  it('accepts exactly one person fully in frame', () => {
    expect(assessAvatar([person])).toBeNull();
  });

  it('warns when nobody is found', () => {
    expect(assessAvatar([])).toBe('noPerson');
    expect(assessAvatar([{ ...person, confidence: 0.2 }])).toBe('noPerson');
  });

  it('warns when there are several people', () => {
    expect(assessAvatar([person, { ...person, x: 0.6 }])).toBe('severalPeople');
  });

  it('ignores low-confidence detections next to a real one', () => {
    expect(assessAvatar([person, { ...person, confidence: 0.1 }])).toBeNull();
  });

  it('warns when the body touches the top or bottom edge', () => {
    expect(assessAvatar([{ ...person, y: 0, height: 0.9 }])).toBe('cutOff');
    expect(assessAvatar([{ ...person, y: 0.3, height: 0.7 }])).toBe('cutOff');
  });

  it('warns when the person is too far away', () => {
    expect(assessAvatar([{ ...person, y: 0.4, height: 0.2 }])).toBe('tooSmall');
  });
});

describe('avatar storage', () => {
  const makeDeps = () => {
    const saved: string[] = [];
    const removed: string[] = [];
    const deps: AvatarDeps = {
      save: jest.fn(async (uri: string) => {
        const path = `images/avatar/${saved.length}.jpg`;
        saved.push(uri);
        return path;
      }),
      remove: jest.fn(async (path: string) => void removed.push(path)),
      resize: jest.fn(async () => 'file:///tmp/small.jpg'),
    };
    return { deps, saved, removed };
  };

  it('keeps the aspect ratio and never enlarges', () => {
    expect(smallSize(3000, 4000)).toEqual({ width: 768, height: 1024 });
    expect(smallSize(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(smallSize(600, 800)).toEqual({ width: 600, height: 800 });
  });

  it('stores the original and a downscaled copy', async () => {
    const { deps, saved } = makeDeps();
    const stored = await storeAvatar(
      { uri: 'file:///tmp/full.jpg', width: 3000, height: 4000 },
      deps,
    );
    expect(stored).toEqual({
      avatarPath: 'images/avatar/0.jpg',
      avatarSmallPath: 'images/avatar/1.jpg',
    });
    expect(saved).toEqual(['file:///tmp/full.jpg', 'file:///tmp/small.jpg']);
    expect(deps.resize).toHaveBeenCalledWith('file:///tmp/full.jpg', { width: 768, height: 1024 });
  });

  it('removes the original again when the copy cannot be made', async () => {
    const { deps, removed } = makeDeps();
    (deps.resize as jest.Mock).mockRejectedValue(new Error('no space'));
    await expect(
      storeAvatar({ uri: 'file:///tmp/full.jpg', width: 3000, height: 4000 }, deps),
    ).rejects.toThrow('no space');
    expect(removed).toEqual(['images/avatar/0.jpg']);
  });

  it('deletes both files of a discarded avatar', async () => {
    const { deps, removed } = makeDeps();
    await discardAvatar({ avatarPath: 'images/avatar/a.jpg', avatarSmallPath: null }, deps);
    await discardAvatar(
      { avatarPath: 'images/avatar/b.jpg', avatarSmallPath: 'images/avatar/c.jpg' },
      deps,
    );
    expect(removed).toEqual(['images/avatar/a.jpg', 'images/avatar/b.jpg', 'images/avatar/c.jpg']);
  });
});

describe('greeting', () => {
  const at = (hour: number) => new Date(2026, 9, 2, hour, 30);

  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [0, 'night'],
    [4, 'night'],
  ])('at %i:30 it is %s', (hour, part) => {
    expect(dayPart(at(hour))).toBe(part);
    expect(greetingKey(at(hour))).toBe(`greeting.${part}`);
  });
});

describe('height units', () => {
  it('uses imperial units only where they are customary', () => {
    expect(lengthSystem('US')).toBe('imperial');
    expect(lengthSystem('CZ')).toBe('metric');
    expect(lengthSystem(null)).toBe('metric');
  });

  it('converts between centimetres and feet and inches', () => {
    expect(cmToFeetInches(170)).toEqual({ feet: 5, inches: 7 });
    expect(cmToFeetInches(183)).toEqual({ feet: 6, inches: 0 });
    expect(feetInchesToCm(5, 7)).toBe(170);
  });

  it('parses metric input', () => {
    expect(parseHeight('168', 'metric')).toBe(168);
    expect(parseHeight(' 168 cm ', 'metric')).toBe(168);
    expect(parseHeight('167,6', 'metric')).toBe(168);
  });

  it('parses imperial input in common spellings', () => {
    expect(parseHeight('5 7', 'imperial')).toBe(170);
    expect(parseHeight("5'7", 'imperial')).toBe(170);
    expect(parseHeight('5ft 7in', 'imperial')).toBe(170);
    expect(parseHeight('6', 'imperial')).toBe(183);
  });

  it('rejects empty and implausible input', () => {
    expect(parseHeight('', 'metric')).toBeNull();
    expect(parseHeight('tall', 'metric')).toBeNull();
    expect(parseHeight('17', 'metric')).toBeNull();
    expect(parseHeight('1680', 'metric')).toBeNull();
    expect(parseHeight('168', 'imperial')).toBeNull();
  });

  it('formats height for display', () => {
    expect(formatHeight(168, 'metric')).toBe('168 cm');
    expect(formatHeight(170, 'imperial')).toBe('5′ 7″');
  });
});
