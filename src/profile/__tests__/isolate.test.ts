import { storeAvatar, storeAvatarAnd, type AvatarDeps } from '../avatar';

const photo = { uri: 'file:///picked/me.heic', width: 3000, height: 4000 };

function fakeDeps(isolate?: AvatarDeps['isolate']) {
  const saved: string[] = [];
  const resized: { uri: string; size: { width: number; height: number } }[] = [];
  const removed: string[] = [];
  const deps: AvatarDeps = {
    save: async (uri) => {
      saved.push(uri);
      return `images/avatar/${saved.length}`;
    },
    remove: async (path) => void removed.push(path),
    resize: async (uri, size) => {
      resized.push({ uri, size });
      return `${uri}#small`;
    },
    ...(isolate ? { isolate } : {}),
  };
  return { deps, saved, resized, removed };
}

describe('the photo of the user', () => {
  it('keeps the original and makes outfit pictures from the person alone on white', async () => {
    const person = { uri: 'file:///cache/cutout-1.jpg', width: 3000, height: 4000 };
    const { deps, saved, resized } = fakeDeps(async () => person);

    expect(await storeAvatar(photo, deps)).toEqual({
      avatarPath: 'images/avatar/1',
      avatarSmallPath: 'images/avatar/2',
      isolated: true,
    });
    expect(saved).toEqual([photo.uri, `${person.uri}#small`]);
    expect(resized).toEqual([{ uri: person.uri, size: { width: 768, height: 1024 } }]);
  });

  it('sizes the small copy by the cutout, not by the photo', async () => {
    const { deps, resized } = fakeDeps(async () => ({ uri: 'cut.jpg', width: 800, height: 600 }));
    await storeAvatar(photo, deps);
    expect(resized[0].size).toEqual({ width: 800, height: 600 });
  });

  it.each([
    ['nobody is found', async () => null],
    [
      'cutting out fails',
      async () => {
        throw new Error('vision failed');
      },
    ],
  ])('uses the photo as it is when %s', async (_name, isolate) => {
    const { deps, saved, removed } = fakeDeps(isolate);

    expect(await storeAvatar(photo, deps)).toMatchObject({ isolated: false });
    expect(saved).toEqual([photo.uri, `${photo.uri}#small`]);
    expect(removed).toEqual([]);
  });

  describe('when the person was cut out but the cut-out copy cannot be made', () => {
    const person = { uri: 'file:///cache/cutout-1.jpg', width: 900, height: 1200 };

    it('uses the photo as it is when resizing the cutout fails', async () => {
      const { deps, saved, resized, removed } = fakeDeps(async () => person);
      const resize = deps.resize;
      deps.resize = async (uri, size) => {
        if (uri === person.uri) throw new Error('cannot decode the cutout');
        return resize(uri, size);
      };

      expect(await storeAvatar(photo, deps)).toEqual({
        avatarPath: 'images/avatar/1',
        avatarSmallPath: 'images/avatar/2',
        isolated: false,
      });
      expect(saved).toEqual([photo.uri, `${photo.uri}#small`]);
      // The small copy is sized by the photo this time.
      expect(resized).toEqual([{ uri: photo.uri, size: { width: 768, height: 1024 } }]);
      expect(removed).toEqual([]);
    });

    it('uses the photo as it is when saving the cut-out copy fails', async () => {
      const { deps, saved, removed } = fakeDeps(async () => person);
      const save = deps.save;
      deps.save = async (uri, folder) => {
        if (uri === `${person.uri}#small`) throw new Error('disk full');
        return save(uri, folder);
      };

      expect(await storeAvatar(photo, deps)).toEqual({
        avatarPath: 'images/avatar/1',
        avatarSmallPath: 'images/avatar/2',
        isolated: false,
      });
      expect(saved).toEqual([photo.uri, `${photo.uri}#small`]);
      expect(removed).toEqual([]);
    });

    it('removes the original and fails when the photo as it is cannot be stored either', async () => {
      const { deps, saved, removed } = fakeDeps(async () => person);
      deps.resize = async (uri) => {
        throw new Error(`cannot resize ${uri}`);
      };

      // The reason given is that of the photo, the last thing that was tried.
      await expect(storeAvatar(photo, deps)).rejects.toThrow(`cannot resize ${photo.uri}`);
      expect(saved).toEqual([photo.uri]);
      expect(removed).toEqual(['images/avatar/1']);
    });

    it('still gives the reason when removing the original fails too', async () => {
      const { deps } = fakeDeps(async () => person);
      deps.resize = async () => {
        throw new Error('out of memory');
      };
      deps.remove = async () => {
        throw new Error('cannot delete');
      };
      await expect(storeAvatar(photo, deps)).rejects.toThrow('out of memory');
    });
  });

  it('uses the photo as it is on a build without the cutout', async () => {
    const { deps } = fakeDeps();
    expect((await storeAvatar(photo, deps)).isolated).toBe(false);
  });

  it('tells whoever records the avatar whether it was cut out, and records only the paths', async () => {
    const { deps } = fakeDeps(async () => null);
    const persist = jest.fn(async () => 'saved');

    expect(await storeAvatarAnd(photo, deps, persist)).toBe('saved');
    expect(persist).toHaveBeenCalledWith(
      { avatarPath: 'images/avatar/1', avatarSmallPath: 'images/avatar/2' },
      { isolated: false },
    );
  });
});
