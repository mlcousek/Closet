import { discardAvatar, storeAvatar, storeAvatarAnd, type AvatarDeps } from '../avatar';
import { avatarDeps, checkAvatarPhoto, extensionOf, pickPhoto } from '../photo';

const mockPicker = {
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
};
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: (...args: unknown[]) =>
    mockPicker.requestCameraPermissionsAsync(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockPicker.requestMediaLibraryPermissionsAsync(...args),
  launchCameraAsync: (...args: unknown[]) => mockPicker.launchCameraAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockPicker.launchImageLibraryAsync(...args),
}));

const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
}));

const mockStore = { save: jest.fn(), remove: jest.fn() };
jest.mock('@/storage/imageStore', () => ({
  imageStore: {
    save: (...args: unknown[]) => mockStore.save(...args),
    remove: (...args: unknown[]) => mockStore.remove(...args),
  },
}));

const mockDetect = jest.fn();
jest.mock('../../../modules/closet-vision', () => ({
  detectPeople: (...args: unknown[]) => mockDetect(...args),
}));

const asset = { uri: 'file:///cache/picked.jpg', width: 3000, height: 4000 };
const OPTIONS = { mediaTypes: ['images'], quality: 1 };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('taking or choosing a photo', () => {
  it('asks for the camera and returns the photo that was taken', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ ...asset, fileName: 'IMG_1.jpg', exif: { Make: 'Apple' }, type: 'image' }],
    });

    const result = await pickPhoto('camera');

    // Only what the app needs is kept; nothing else about the photo travels on.
    expect(result).toEqual({ status: 'picked', photo: asset });
    expect(mockPicker.launchCameraAsync).toHaveBeenCalledTimes(1);
    expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith(OPTIONS);
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('does not open the camera when permission is refused', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    expect(await pickPhoto('camera')).toEqual({ status: 'denied' });

    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(mockPicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('reports a cancelled camera as cancelled, not as denied', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    mockPicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickPhoto('camera')).toEqual({ status: 'cancelled' });
  });

  it('opens the photo library without asking for any permission', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] });

    const result = await pickPhoto('library');

    expect(result).toEqual({ status: 'picked', photo: asset });
    expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(OPTIONS);
    expect(mockPicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('reports a dismissed library as cancelled', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickPhoto('library')).toEqual({ status: 'cancelled' });
  });

  it('treats an answer without any photo as cancelled', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [] });
    expect(await pickPhoto('library')).toEqual({ status: 'cancelled' });
  });

  it('takes the first photo when the picker hands back several', async () => {
    mockPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [asset, { uri: 'file:///cache/second.jpg', width: 10, height: 10 }],
    });
    expect(await pickPhoto('library')).toEqual({ status: 'picked', photo: asset });
  });

  it('lets a failing picker through to the caller', async () => {
    mockPicker.launchImageLibraryAsync.mockRejectedValue(new Error('picker crashed'));
    await expect(pickPhoto('library')).rejects.toThrow('picker crashed');
  });
});

describe('checking a photo for use as the avatar', () => {
  const person = { x: 0.3, y: 0.1, width: 0.4, height: 0.8, confidence: 0.9 };

  it('finds nothing wrong with one person fully in frame', async () => {
    mockDetect.mockResolvedValue([person]);

    expect(await checkAvatarPhoto('file:///cache/me.jpg')).toBeNull();
    expect(mockDetect).toHaveBeenCalledWith('file:///cache/me.jpg');
  });

  it.each([
    ['noPerson', []],
    ['severalPeople', [person, { ...person, x: 0.6 }]],
    ['cutOff', [{ ...person, y: 0 }]],
    ['tooSmall', [{ ...person, y: 0.4, height: 0.2 }]],
  ])('warns about %s', async (issue, boxes) => {
    mockDetect.mockResolvedValue(boxes);
    expect(await checkAvatarPhoto('file:///cache/me.jpg')).toBe(issue);
  });

  it('does not warn when detection is not available on this build', async () => {
    mockDetect.mockResolvedValue(null);
    expect(await checkAvatarPhoto('file:///cache/me.jpg')).toBeNull();
  });

  it('does not warn when detection fails, because the check must never block', async () => {
    mockDetect.mockRejectedValue(new Error('vision request failed'));
    expect(await checkAvatarPhoto('file:///cache/me.jpg')).toBeNull();
  });
});

describe('file extension of a photo', () => {
  it.each([
    ['file:///cache/a.jpg', 'jpg'],
    ['file:///cache/a.jpeg', 'jpeg'],
    ['file:///cache/a.PNG', 'png'],
    ['file:///cache/IMG_0042.HEIC', 'heic'],
    ['https://example.com/photo.png?size=large&v=2.1', 'png'],
    ['file:///cache/archive.tar.png', 'png'],
    // Anything the image tools may not read is stored under the common default.
    ['file:///cache/a.webp', 'jpg'],
    ['file:///cache/a.gif', 'jpg'],
    ['file:///cache/no-extension', 'jpg'],
    ['', 'jpg'],
  ])('%s is stored as %s', (uri, extension) => {
    expect(extensionOf(uri)).toBe(extension);
  });
});

describe('avatar storage on the device', () => {
  const stubStore = () => {
    let count = 0;
    mockStore.save.mockImplementation(
      async (_uri: string, folder: string, extension: string) =>
        `images/${folder}/${++count}.${extension}`,
    );
    mockStore.remove.mockResolvedValue(undefined);
    mockManipulate.mockResolvedValue({ uri: 'file:///cache/ImageManipulator/small.jpg' });
  };

  it('saves into the image store with the extension of the source', async () => {
    stubStore();

    expect(await avatarDeps.save('file:///cache/IMG_1.HEIC', 'avatar')).toBe(
      'images/avatar/1.heic',
    );
    expect(mockStore.save).toHaveBeenCalledWith('file:///cache/IMG_1.HEIC', 'avatar', 'heic');

    // A caller cannot override it: the extension always follows the file.
    await avatarDeps.save('file:///cache/odd.bin', 'avatar', 'png');
    expect(mockStore.save).toHaveBeenLastCalledWith('file:///cache/odd.bin', 'avatar', 'jpg');
  });

  it('removes from the image store', async () => {
    stubStore();
    await avatarDeps.remove('images/avatar/old.jpg');
    expect(mockStore.remove).toHaveBeenCalledWith('images/avatar/old.jpg');
  });

  it('resizes to the exact size asked for, as a JPEG, and returns the temporary file', async () => {
    stubStore();

    const uri = await avatarDeps.resize('file:///cache/full.png', { width: 768, height: 1024 });

    expect(uri).toBe('file:///cache/ImageManipulator/small.jpg');
    expect(mockManipulate).toHaveBeenCalledWith(
      'file:///cache/full.png',
      [{ resize: { width: 768, height: 1024 } }],
      { compress: 0.9, format: 'jpeg' },
    );
  });

  it('stores the original as it is and a downscaled JPEG copy next to it', async () => {
    stubStore();

    const stored = await storeAvatar(
      { uri: 'file:///cache/full.png', width: 3000, height: 4000 },
      avatarDeps,
    );

    expect(stored).toEqual({
      avatarPath: 'images/avatar/1.png',
      avatarSmallPath: 'images/avatar/2.jpg',
    });
    expect(mockStore.save.mock.calls).toEqual([
      ['file:///cache/full.png', 'avatar', 'png'],
      ['file:///cache/ImageManipulator/small.jpg', 'avatar', 'jpg'],
    ]);
    expect(mockManipulate.mock.calls[0][1]).toEqual([{ resize: { width: 768, height: 1024 } }]);
    expect(mockStore.remove).not.toHaveBeenCalled();
  });

  it('does not enlarge a photo that is already small', async () => {
    stubStore();

    await storeAvatar({ uri: 'file:///cache/small.jpg', width: 600, height: 800 }, avatarDeps);

    expect(mockManipulate.mock.calls[0][1]).toEqual([{ resize: { width: 600, height: 800 } }]);
  });

  it('removes the original again when the small copy cannot be made', async () => {
    stubStore();
    mockManipulate.mockRejectedValue(new Error('out of memory'));

    await expect(
      storeAvatar({ uri: 'file:///cache/full.jpg', width: 3000, height: 4000 }, avatarDeps),
    ).rejects.toThrow('out of memory');

    expect(mockStore.remove.mock.calls).toEqual([['images/avatar/1.jpg']]);
    expect(mockStore.save).toHaveBeenCalledTimes(1);
  });

  it('removes the original again when the small copy cannot be saved', async () => {
    stubStore();
    mockStore.save
      .mockResolvedValueOnce('images/avatar/original.jpg')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(
      storeAvatar({ uri: 'file:///cache/full.jpg', width: 3000, height: 4000 }, avatarDeps),
    ).rejects.toThrow('disk full');

    expect(mockStore.remove.mock.calls).toEqual([['images/avatar/original.jpg']]);
  });

  it('stores nothing and removes nothing when the original cannot be saved', async () => {
    stubStore();
    mockStore.save.mockRejectedValue(new Error('unreadable photo'));

    await expect(
      storeAvatar({ uri: 'file:///cache/full.jpg', width: 3000, height: 4000 }, avatarDeps),
    ).rejects.toThrow('unreadable photo');

    expect(mockManipulate).not.toHaveBeenCalled();
    expect(mockStore.remove).not.toHaveBeenCalled();
  });
});

describe('storing an avatar and recording it', () => {
  const photo = { uri: 'file:///cache/full.jpg', width: 3000, height: 4000 };
  const makeDeps = () => {
    const removed: string[] = [];
    let count = 0;
    const deps: AvatarDeps = {
      save: jest.fn(async () => `images/avatar/${++count}.jpg`),
      remove: jest.fn(async (path: string) => void removed.push(path)),
      resize: jest.fn(async () => 'file:///cache/small.jpg'),
    };
    return { deps, removed };
  };

  it('hands the stored paths to the caller and returns what the caller made of them', async () => {
    const { deps, removed } = makeDeps();
    const persist = jest.fn(async (stored: { avatarPath: string }) => ({
      id: 'profile-1',
      avatarPath: stored.avatarPath,
    }));

    const result = await storeAvatarAnd(photo, deps, persist);

    expect(persist).toHaveBeenCalledWith({
      avatarPath: 'images/avatar/1.jpg',
      avatarSmallPath: 'images/avatar/2.jpg',
    });
    expect(result).toEqual({ id: 'profile-1', avatarPath: 'images/avatar/1.jpg' });
    expect(removed).toEqual([]);
  });

  it('deletes both new files when recording fails, and reports that failure', async () => {
    const { deps, removed } = makeDeps();

    await expect(
      storeAvatarAnd(photo, deps, async () => {
        throw new Error('database is locked');
      }),
    ).rejects.toThrow('database is locked');

    expect(removed).toEqual(['images/avatar/1.jpg', 'images/avatar/2.jpg']);
  });

  it('still reports the recording failure when the clean-up fails as well', async () => {
    const { deps } = makeDeps();
    (deps.remove as jest.Mock).mockRejectedValue(new Error('cannot delete'));

    await expect(
      storeAvatarAnd(photo, deps, async () => {
        throw new Error('database is locked');
      }),
    ).rejects.toThrow('database is locked');
  });

  it('records nothing when the photo could not be stored', async () => {
    const { deps } = makeDeps();
    (deps.resize as jest.Mock).mockRejectedValue(new Error('out of memory'));
    const persist = jest.fn();

    await expect(storeAvatarAnd(photo, deps, persist)).rejects.toThrow('out of memory');

    expect(persist).not.toHaveBeenCalled();
  });
});

describe('discarding an avatar', () => {
  it('removes nothing for a profile without a photo', async () => {
    const remove = jest.fn(async () => {});
    await discardAvatar({ avatarPath: null, avatarSmallPath: null }, { remove });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes the small copy even when the original is already gone from the profile', async () => {
    const remove = jest.fn(async (_path: string) => {});
    await discardAvatar({ avatarPath: null, avatarSmallPath: 'images/avatar/s.jpg' }, { remove });
    expect(remove.mock.calls).toEqual([['images/avatar/s.jpg']]);
  });

  it('removes the original before the small copy', async () => {
    const remove = jest.fn(async (_path: string) => {});
    await discardAvatar(
      { avatarPath: 'images/avatar/o.heic', avatarSmallPath: 'images/avatar/s.jpg' },
      { remove },
    );
    expect(remove.mock.calls).toEqual([['images/avatar/o.heic'], ['images/avatar/s.jpg']]);
  });

  it('reports a file that cannot be removed', async () => {
    const remove = jest.fn(async (_path: string) => {
      throw new Error('cannot delete');
    });
    await expect(
      discardAvatar({ avatarPath: 'images/avatar/o.jpg', avatarSmallPath: null }, { remove }),
    ).rejects.toThrow('cannot delete');
  });

  it('removes through the image store on the device', async () => {
    mockStore.remove.mockResolvedValue(undefined);
    await discardAvatar(
      { avatarPath: 'images/avatar/o.jpg', avatarSmallPath: 'images/avatar/s.jpg' },
      avatarDeps,
    );
    expect(mockStore.remove.mock.calls).toEqual([['images/avatar/o.jpg'], ['images/avatar/s.jpg']]);
  });
});
