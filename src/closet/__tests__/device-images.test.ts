import { itemImageDeps } from '../deviceImages';

const mockFiles = { deleted: [] as [string, object][] };
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: async (uri: string, options: object) => void mockFiles.deleted.push([uri, options]),
}));
jest.mock('@/storage/imageStore', () => ({ imageStore: {} }));
jest.mock('../../../modules/closet-vision', () => ({ removeBackground: jest.fn() }));

/** The image manipulator: one decoded image per render, each of which has to be released. */
const mockManipulator = {
  size: { width: 0, height: 0 },
  failRender: false,
  opened: [] as string[],
  resizes: [] as object[],
  saves: [] as object[],
  alive: 0,
};
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: {
    manipulate: (uri: string) => {
      mockManipulator.opened.push(uri);
      let size = { ...mockManipulator.size };
      mockManipulator.alive++;
      const context = {
        resize: (resize: { width?: number; height?: number }) => {
          mockManipulator.resizes.push(resize);
          const scale = resize.width ? resize.width / size.width : resize.height! / size.height;
          size = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
          return context;
        },
        renderAsync: async () => {
          if (mockManipulator.failRender) throw new Error('cannot decode image');
          const rendered = { ...size };
          mockManipulator.alive++;
          return {
            ...rendered,
            saveAsync: async (options: object) => {
              mockManipulator.saves.push(options);
              return { uri: 'file:///cache/ImageManipulator/out.jpg', ...rendered };
            },
            release: () => void mockManipulator.alive--,
          };
        },
        release: () => void mockManipulator.alive--,
      };
      return context;
    },
  },
}));

beforeEach(() => {
  Object.assign(mockManipulator, {
    size: { width: 6048, height: 8064 },
    failRender: false,
    opened: [],
    resizes: [],
    saves: [],
    alive: 0,
  });
  mockFiles.deleted = [];
});

describe('reducing a photo on the device', () => {
  it('writes a JPEG of at most 2400 px at quality 0.9 and frees what it decoded', async () => {
    const reduced = await itemImageDeps.reduce({ uri: 'file:///picked/IMG_1.heic' });

    expect(reduced).toEqual({
      uri: 'file:///cache/ImageManipulator/out.jpg',
      width: 1800,
      height: 2400,
    });
    // Opened once: the same decoded image is measured and then resized.
    expect(mockManipulator.opened).toEqual(['file:///picked/IMG_1.heic']);
    expect(mockManipulator.resizes).toEqual([{ height: 2400 }]);
    expect(mockManipulator.saves).toEqual([{ compress: 0.9, format: 'jpeg' }]);
    expect(mockManipulator.alive).toBe(0);
  });

  it('converts a small HEIC without resizing it', async () => {
    mockManipulator.size = { width: 1200, height: 900 };

    const reduced = await itemImageDeps.reduce({ uri: 'file:///picked/small.heic' });

    expect(mockManipulator.resizes).toEqual([]);
    expect(mockManipulator.saves).toEqual([{ compress: 0.9, format: 'jpeg' }]);
    expect(reduced).toEqual({
      uri: 'file:///cache/ImageManipulator/out.jpg',
      width: 1200,
      height: 900,
    });
    expect(mockManipulator.alive).toBe(0);
  });

  it('writes nothing for a small JPEG of unknown size, and never opens one of known size', async () => {
    mockManipulator.size = { width: 1200, height: 900 };

    expect(await itemImageDeps.reduce({ uri: 'file:///cache/link-import-1.jpg' })).toEqual({
      uri: 'file:///cache/link-import-1.jpg',
      width: 1200,
      height: 900,
    });
    expect(mockManipulator.saves).toEqual([]);
    expect(mockManipulator.alive).toBe(0);

    const known = { uri: 'file:///picked/small.png', width: 1200, height: 900 };
    expect(await itemImageDeps.reduce(known)).toBe(known);
    expect(mockManipulator.opened).toEqual(['file:///cache/link-import-1.jpg']);
  });

  it('returns the photo as it came when it cannot be decoded, holding on to nothing', async () => {
    mockManipulator.failRender = true;
    const photo = { uri: 'file:///picked/broken.heic', width: 6048, height: 8064 };

    expect(await itemImageDeps.reduce(photo)).toBe(photo);
    expect(mockManipulator.alive).toBe(0);
  });

  it('discards a temporary file, and does not mind when it is already gone', async () => {
    await itemImageDeps.discard('file:///cache/ImageManipulator/out.jpg');
    expect(mockFiles.deleted).toEqual([
      ['file:///cache/ImageManipulator/out.jpg', { idempotent: true }],
    ]);
  });
});
