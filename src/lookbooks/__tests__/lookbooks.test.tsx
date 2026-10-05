import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createItemRepository } from '@/closet/repository';
import type { Item } from '@/closet/types';
import { createTestDb } from '@/db/testing';
import { createOutfitRepository } from '@/outfits/repository';
import { ShareSheet, type ShareOutfit } from '@/sharing/ShareSheet';
import { availableContents, sheetColumns, sheetPages } from '@/sharing/share';

import { LookbookPicker } from '../LookbookPicker';
import { createLookbookRepository, type Lookbook } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const mockCapture = jest.fn(async (..._args: unknown[]) => 'file:///tmp/card.png');
jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCapture(...args),
}));
const mockShare = jest.fn(async (..._args: unknown[]) => {});
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShare(...args) }));
const mockPermission = { granted: true };
const mockAssetCreate = jest.fn(async (..._args: unknown[]) => ({}));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: async () => mockPermission,
  Asset: { create: (...args: unknown[]) => mockAssetCreate(...args) },
}));

let mockLookbooks: Lookbook[] = [];
const mockLookbookRepo = {
  create: jest.fn(async (name: string) => {
    const created: Lookbook = {
      id: `lb-${mockLookbooks.length + 1}`,
      createdAt: 1,
      name,
      description: null,
      outfitIds: [],
      coverOutfitId: null,
    };
    mockLookbooks = [...mockLookbooks, created];
    return created;
  }),
  addOutfits: jest.fn(async (..._args: unknown[]) => {}),
  removeOutfit: jest.fn(async (..._args: unknown[]) => {}),
};
jest.mock('../useLookbooks', () => ({
  useLookbooks: () => ({ data: mockLookbooks }),
  useInvalidateLookbooks: () => async () => {},
}));
jest.mock('../repository', () => ({
  ...jest.requireActual('../repository'),
  lookbookRepository: {
    create: (name: string) => mockLookbookRepo.create(name),
    addOutfits: (...args: unknown[]) => mockLookbookRepo.addOutfits(...args),
    removeOutfit: (...args: unknown[]) => mockLookbookRepo.removeOutfit(...args),
  },
}));

const withQuery = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockLookbooks = [];
  mockPermission.granted = true;
});

describe('lookbook repository', () => {
  const images = { originalPath: 'o.jpg', cutoutPath: null, thumbPath: 't.jpg' };
  const setup = async () => {
    const { db } = await createTestDb();
    let clock = 1000;
    const now = () => clock++;
    const items = createItemRepository(() => db, now);
    const outfits = createOutfitRepository(() => db, now);
    const lookbooks = createLookbookRepository(() => db, now);
    const shirt = await items.create(
      {
        name: 'Shirt',
        category: 'tops',
        subcategory: null,
        colours: [],
        seasons: [],
        occasions: [],
        warmth: null,
        brand: null,
        size: null,
        price: null,
        currency: null,
        purchasedAt: null,
        notes: null,
        sourceUrl: null,
      },
      images,
    );
    const piece = [{ itemId: shirt.id, slot: 'top' as const, position: 0 }];
    const a = await outfits.create(piece, { name: 'A' });
    const b = await outfits.create(piece, { name: 'B' });
    const c = await outfits.create(piece, { name: 'C' });
    return { lookbooks, outfits, a, b, c };
  };

  it('creates a named lookbook and refuses one without a name', async () => {
    const { lookbooks } = await setup();
    const summer = await lookbooks.create('  Summer ');
    expect(summer).toMatchObject({ name: 'Summer', outfitIds: [], coverOutfitId: null });
    await expect(lookbooks.create('   ')).rejects.toThrow();
    expect((await lookbooks.list()).map((entry) => entry.name)).toEqual(['Summer']);
  });

  it('adds outfits in order, ignores repeats, and lets an outfit be in several lookbooks', async () => {
    const { lookbooks, a, b, c } = await setup();
    const summer = await lookbooks.create('Summer');
    const work = await lookbooks.create('Work');
    await lookbooks.addOutfits(summer.id, [a.id, b.id]);
    await lookbooks.addOutfits(summer.id, [b.id, c.id]);
    await lookbooks.addOutfits(work.id, [a.id]);
    expect((await lookbooks.get(summer.id))!.outfitIds).toEqual([a.id, b.id, c.id]);
    expect((await lookbooks.containing(a.id)).sort()).toEqual([summer.id, work.id].sort());
  });

  it('removes an outfit from a lookbook without deleting the outfit', async () => {
    const { lookbooks, outfits, a, b } = await setup();
    const summer = await lookbooks.create('Summer');
    await lookbooks.addOutfits(summer.id, [a.id, b.id]);
    await lookbooks.removeOutfit(summer.id, a.id);
    expect((await lookbooks.get(summer.id))!.outfitIds).toEqual([b.id]);
    expect(await outfits.get(a.id)).not.toBeNull();
  });

  it('reorders outfits and keeps the order', async () => {
    const { lookbooks, a, b, c } = await setup();
    const summer = await lookbooks.create('Summer');
    await lookbooks.addOutfits(summer.id, [a.id, b.id, c.id]);
    await lookbooks.moveOutfit(summer.id, c.id, 0);
    expect((await lookbooks.get(summer.id))!.outfitIds).toEqual([c.id, a.id, b.id]);
    await lookbooks.moveOutfit(summer.id, c.id, 99);
    expect((await lookbooks.get(summer.id))!.outfitIds).toEqual([a.id, b.id, c.id]);
  });

  it('uses the first outfit as cover unless another is chosen and still in the lookbook', async () => {
    const { lookbooks, a, b } = await setup();
    const summer = await lookbooks.create('Summer');
    await lookbooks.addOutfits(summer.id, [a.id, b.id]);
    expect((await lookbooks.get(summer.id))!.coverOutfitId).toBe(a.id);
    await lookbooks.setCover(summer.id, b.id);
    expect((await lookbooks.get(summer.id))!.coverOutfitId).toBe(b.id);
    await lookbooks.removeOutfit(summer.id, b.id);
    expect((await lookbooks.get(summer.id))!.coverOutfitId).toBe(a.id);
  });

  it('renames a lookbook', async () => {
    const { lookbooks } = await setup();
    const summer = await lookbooks.create('Summer');
    expect((await lookbooks.rename(summer.id, 'Holiday'))!.name).toBe('Holiday');
    await expect(lookbooks.rename(summer.id, ' ')).rejects.toThrow();
  });

  it('deletes a lookbook but keeps its outfits, and restores it on undo', async () => {
    const { lookbooks, outfits, a, b } = await setup();
    const summer = await lookbooks.create('Summer');
    await lookbooks.addOutfits(summer.id, [a.id, b.id]);
    await lookbooks.remove(summer.id);
    expect(await lookbooks.list()).toEqual([]);
    expect(await lookbooks.containing(a.id)).toEqual([]);
    expect((await outfits.list()).length).toBe(3);
    await lookbooks.restore(summer.id);
    expect((await lookbooks.get(summer.id))!.outfitIds).toEqual([a.id, b.id]);
  });

  it('leaves deleted outfits out of a lookbook', async () => {
    const { lookbooks, outfits, a, b } = await setup();
    const summer = await lookbooks.create('Summer');
    await lookbooks.addOutfits(summer.id, [a.id, b.id]);
    await outfits.remove(a.id);
    expect((await lookbooks.get(summer.id))!.outfitIds).toEqual([b.id]);
  });
});

describe('lookbook picker', () => {
  const lookbook = (id: string, name: string): Lookbook => ({
    id,
    createdAt: 1,
    name,
    description: null,
    outfitIds: [],
    coverOutfitId: null,
  });

  it('toggles one outfit in and out of lookbooks', async () => {
    mockLookbooks = [lookbook('lb-1', 'Summer'), lookbook('lb-2', 'Work')];
    withQuery(<LookbookPicker outfitIds={['o1']} containing={['lb-1']} onClose={jest.fn()} />);
    expect(screen.getByTestId('pick-lookbook-lb-1')).toBeChecked();
    expect(screen.getByTestId('pick-lookbook-lb-2')).not.toBeChecked();

    fireEvent.press(screen.getByTestId('pick-lookbook-lb-2'));
    await waitFor(() => expect(mockLookbookRepo.addOutfits).toHaveBeenCalledWith('lb-2', ['o1']));
    await waitFor(() => expect(screen.getByTestId('pick-lookbook-lb-2')).toBeChecked());

    fireEvent.press(screen.getByTestId('pick-lookbook-lb-1'));
    await waitFor(() => expect(mockLookbookRepo.removeOutfit).toHaveBeenCalledWith('lb-1', 'o1'));
  });

  it('adds several outfits to the tapped lookbook and closes', async () => {
    mockLookbooks = [lookbook('lb-1', 'Summer')];
    const onClose = jest.fn();
    withQuery(<LookbookPicker outfitIds={['o1', 'o2']} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('pick-lookbook-lb-1'));
    await waitFor(() =>
      expect(mockLookbookRepo.addOutfits).toHaveBeenCalledWith('lb-1', ['o1', 'o2']),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('creates a lookbook in place, and not without a name', async () => {
    withQuery(<LookbookPicker outfitIds={['o1']} onClose={jest.fn()} />);
    expect(screen.getByTestId('new-lookbook-create')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('new-lookbook-name'), 'Summer');
    fireEvent.press(screen.getByTestId('new-lookbook-create'));
    await waitFor(() => expect(mockLookbookRepo.create).toHaveBeenCalledWith('Summer'));
    await waitFor(() => expect(mockLookbookRepo.addOutfits).toHaveBeenCalledWith('lb-1', ['o1']));
  });
});

describe('sharing', () => {
  const piece = (id: string): Pick<Item, 'id' | 'thumbPath' | 'name' | 'brand'> => ({
    id,
    thumbPath: `images/items/${id}-t.jpg`,
    name: id,
    brand: id === 'shirt' ? 'Arket' : null,
  });
  const outfit = (id: string, renderPath: string | null = null): ShareOutfit => ({
    id,
    name: 'Friday',
    items: [piece('shirt'), piece('skirt')],
    renderPath,
  });

  it('offers the render only when there is one', () => {
    expect(availableContents(true)).toEqual(['render', 'collage']);
    expect(availableContents(false)).toEqual(['collage']);
  });

  it('splits a large lookbook into several images', () => {
    const thirty = Array.from({ length: 30 }, (_, index) => index);
    expect(sheetPages(thirty).map((page) => page.length)).toEqual([12, 12, 6]);
    expect(sheetPages([1, 2, 3, 4, 5])).toEqual([[1, 2, 3, 4, 5]]);
    expect(sheetPages([])).toEqual([]);
    expect([1, 4, 5, 12].map(sheetColumns)).toEqual([1, 2, 3, 3]);
  });

  it('shares the render by default and lets the user switch to the pieces only', async () => {
    render(
      <ShareSheet
        title="Friday"
        outfits={[outfit('o1', 'images/renders/r.png')]}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('share-render')).toBeTruthy();
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Friday');

    fireEvent.press(screen.getByTestId('share-content-collage'));
    expect(screen.queryByTestId('share-render')).toBeNull();
    expect(screen.getByTestId('share-collage')).toBeTruthy();

    fireEvent.press(screen.getByTestId('share-send'));
    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith('file:///tmp/card.png', expect.anything()),
    );
  });

  it('offers only the flat preview for an outfit without a render', () => {
    render(<ShareSheet title={null} outfits={[outfit('o1')]} onClose={jest.fn()} />);
    expect(screen.getByTestId('share-collage')).toBeTruthy();
    expect(screen.queryByTestId('share-content-render')).toBeNull();
    expect(screen.queryByTestId('share-card-title')).toBeNull();
  });

  it('captures in the chosen format and can include the item list', async () => {
    render(<ShareSheet title="Friday" outfits={[outfit('o1')]} onClose={jest.fn()} />);
    expect(screen.queryByTestId('share-item-list')).toBeNull();
    fireEvent(screen.getByTestId('share-with-items'), 'valueChange', true);
    expect(screen.getByTestId('share-item-list')).toBeTruthy();
    expect(screen.getByText('Arket')).toBeTruthy();

    fireEvent.press(screen.getByTestId('share-format-story'));
    fireEvent.press(screen.getByTestId('share-send'));
    await waitFor(() => expect(mockCapture).toHaveBeenCalled());
    expect(mockCapture.mock.calls[0][1]).toMatchObject({ width: 1080, height: 1920 });
  });

  it('saves to the photo library and confirms', async () => {
    render(<ShareSheet title="Friday" outfits={[outfit('o1')]} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('share-save'));
    expect(await screen.findByTestId('share-notice')).toHaveTextContent(
      'Saved to your photo library.',
    );
    expect(mockAssetCreate).toHaveBeenCalledWith('file:///tmp/card.png');
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('explains when adding photos is not allowed', async () => {
    mockPermission.granted = false;
    render(<ShareSheet title="Friday" outfits={[outfit('o1')]} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('share-save'));
    expect(await screen.findByTestId('share-denied')).toHaveTextContent(
      /not allowed to add photos/,
    );
    expect(mockAssetCreate).not.toHaveBeenCalled();
  });

  it('sends nothing until the user chooses to share or save', async () => {
    const onClose = jest.fn();
    render(<ShareSheet title="Friday" outfits={[outfit('o1')]} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('share-close'));
    await act(async () => {});
    expect(onClose).toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockAssetCreate).not.toHaveBeenCalled();
  });

  it('lays several outfits out as a contact sheet with the lookbook name', () => {
    render(
      <ShareSheet
        title="Summer"
        outfits={[outfit('o1'), outfit('o2'), outfit('o3'), outfit('o4'), outfit('o5')]}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer');
    expect(screen.getAllByTestId(/^share-tile-/)).toHaveLength(5);
    expect(screen.queryByTestId('share-with-items')).toBeNull();
  });
});
