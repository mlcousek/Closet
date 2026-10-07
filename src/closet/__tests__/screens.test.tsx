import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import ClosetScreen from '@/app/(tabs)/closet';
import ImportScreen from '@/app/import/index';
import ReviewScreen from '@/app/import/review';
import ItemScreen from '@/app/item/[id]';
import LinkImportScreen from '@/app/item/link';
import NewItemScreen from '@/app/item/new';
import { useAddActions } from '@/shell/addActions';

import { useClosetTab } from '../closetTab';
import { ImportIndicator } from '../ImportIndicator';
import { ItemForm } from '../ItemForm';
import { usePendingLink } from '../pendingLink';

import type { Item, ItemFilter } from '../types';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'CZ', currencyCode: 'CZK' }],
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(async (_url: string, target: string) => ({ status: 200, uri: target })),
}));
const mockClipboard = { hasUrl: false, url: '' };
jest.mock('expo-clipboard', () => ({
  hasUrlAsync: async () => mockClipboard.hasUrl,
  getUrlAsync: async () => mockClipboard.url,
}));
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const item = (id: string, patch: Partial<Item> = {}): Item => ({
  id,
  createdAt: 1_700_000_000_000,
  name: `Item ${id}`,
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
  ownership: 'owned',
  originalPath: `images/items/${id}.jpg`,
  cutoutPath: `images/items/${id}.png`,
  thumbPath: `images/items/${id}-t.png`,
  needsReview: false,
  ...patch,
});

let mockItems: Item[] = [];
const matches = (entry: Item, filter: ItemFilter = {}) =>
  entry.ownership === (filter.ownership ?? 'owned') &&
  (!filter.category || entry.category === filter.category) &&
  (!filter.colours?.length || filter.colours.some((colour) => entry.colours.includes(colour))) &&
  (!filter.seasons?.length || filter.seasons.some((season) => entry.seasons.includes(season))) &&
  (filter.needsReview === undefined || entry.needsReview === filter.needsReview);

const mockRepo = {
  list: jest.fn(async (filter?: ItemFilter) => mockItems.filter((entry) => matches(entry, filter))),
  count: jest.fn(
    async (filter?: ItemFilter) => mockItems.filter((entry) => matches(entry, filter)).length,
  ),
  get: jest.fn(async (id: string) => mockItems.find((entry) => entry.id === id) ?? null),
  brands: jest.fn(async () => []),
  wishlistTotals: jest.fn(async () => {
    const wished = mockItems.filter((entry) => entry.ownership === 'wishlist');
    const priced = wished.filter((entry) => entry.price !== null);
    return {
      count: wished.length,
      unpriced: wished.length - priced.length,
      totals:
        priced.length > 0
          ? [{ currency: 'CZK', amount: priced.reduce((sum, entry) => sum + entry.price!, 0) }]
          : [],
    };
  }),
  markBought: jest.fn(async (id: string, purchase: object) => {
    mockItems = mockItems.map((entry) =>
      entry.id === id ? { ...entry, ...purchase, ownership: 'owned' as const } : entry,
    );
    return mockItems.find((entry) => entry.id === id) ?? null;
  }),
  create: jest.fn(async (..._args: unknown[]) => item('new')),
  update: jest.fn(async (id: string, patch: Partial<Item>) => {
    mockItems = mockItems.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
    return mockItems.find((entry) => entry.id === id) ?? null;
  }),
  updateMany: jest.fn(async () => {}),
  archive: jest.fn(async (ids: string[]) => {
    mockItems = mockItems.map((entry) =>
      ids.includes(entry.id) ? { ...entry, ownership: 'archived' as const } : entry,
    );
  }),
  unarchive: jest.fn(async () => {}),
  remove: jest.fn(async (ids: string[]) => {
    mockItems = mockItems.filter((entry) => !ids.includes(entry.id));
  }),
  restore: jest.fn(async () => {}),
};
// Getters, because the screens are imported before the objects below exist.
jest.mock('../repository', () => ({
  get itemRepository() {
    return mockRepo;
  },
}));

const mockProgress = { queued: 0, processing: 0, done: 0, failed: 0, total: 0 };
const mockJobs = { list: jest.fn(async () => [] as object[]) };
const mockRetry = jest.fn(async (_id: string) => {});
jest.mock('../importActions', () => ({
  useImportProgress: (selector?: (state: object) => unknown) => {
    const state = { progress: mockProgress, version: 1 };
    return selector ? selector(state) : state;
  },
  get importJobs() {
    return mockJobs;
  },
  retryImportJob: (id: string) => mockRetry(id),
  dismissFailedImports: jest.fn(async () => {}),
}));

const mockCutout = jest.fn();
const mockStoreImages = jest.fn(async (..._args: unknown[]) => ({
  originalPath: 'images/items/n.jpg',
  cutoutPath: 'images/items/n.png',
  thumbPath: 'images/items/n-t.png',
}));
jest.mock('../deviceImages', () => ({
  itemImageDeps: { cutout: (uri: string) => mockCutout(uri) },
  toTagImage: jest.fn(async () => ({ base64: 'x', mediaType: 'image/png' })),
}));
jest.mock('../itemImages', () => ({
  ...jest.requireActual('../itemImages'),
  storeItemImages: (...args: unknown[]) => mockStoreImages(...args),
  removeItemImages: jest.fn(async () => {}),
}));

const mockTagItem = jest.fn();
jest.mock('@/ai/tagging', () => ({ tagItem: (...args: unknown[]) => mockTagItem(...args) }));
jest.mock('@/ai/client', () => {
  class AiUnavailableError extends Error {
    reason: string;
    constructor(mockReason: string) {
      super(mockReason);
      this.reason = mockReason;
    }
  }
  return { AiUnavailableError };
});

const mockCountUsing = jest.fn(async (_ids: string[]) => 0);
jest.mock('@/outfits/repository', () => ({
  outfitRepository: { countUsing: (ids: string[]) => mockCountUsing(ids) },
}));
jest.mock('@/outfits/useOutfits', () => ({ useInvalidateOutfits: () => async () => {} }));

const mockPickPhoto = jest.fn();
jest.mock('@/profile/photo', () => ({ pickPhoto: (source: string) => mockPickPhoto(source) }));

const mockFetchProduct = jest.fn();
jest.mock('../productPage', () => ({
  ...jest.requireActual('../productPage'),
  fetchProductPage: (link: string) => mockFetchProduct(link),
}));

const renderWithQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

/** Lets a query for a changed filter resolve and render. */
const settle = () =>
  act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));

/** The review screen ignores a tap that follows another within 400 ms; this waits that out. */
const sinceLastAction = () =>
  act(async () => void (await new Promise((resolve) => setTimeout(resolve, 450))));

const confirmAlerts = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockItems = [];
  mockParams = {};
  Object.assign(mockProgress, { queued: 0, processing: 0, done: 0, failed: 0, total: 0 });
  Object.assign(mockClipboard, { hasUrl: false, url: '' });
  mockCutout.mockResolvedValue({ uri: 'file:///tmp/cut.png', width: 10, height: 10 });
  useAddActions.setState({ actions: [], menuOpen: false });
  useClosetTab.setState({ tab: 'closet' });
});

describe('wishlist', () => {
  const seedWishlist = () => {
    mockItems = [
      item('shirt', { name: 'White shirt' }),
      item('coat', { name: 'Dream coat', ownership: 'wishlist', price: 4000, currency: 'CZK' }),
      item('bag', { name: 'Dream bag', ownership: 'wishlist' }),
    ];
  };

  it('keeps wishlist items out of the closet tab and its count', async () => {
    seedWishlist();
    renderWithQuery(<ClosetScreen />);
    expect(await screen.findByText('White shirt')).toBeTruthy();
    expect(screen.queryByText('Dream coat')).toBeNull();
    expect(screen.getByTestId('closet-count')).toHaveTextContent('1 items');
  });

  it('shows only wishlist items on the Wishlist tab, with the total and missing prices', async () => {
    seedWishlist();
    renderWithQuery(<ClosetScreen />);
    await screen.findByText('White shirt');
    fireEvent.press(screen.getByTestId('closet-tab-wishlist'));
    await settle();
    expect(screen.getByText('Dream coat')).toBeTruthy();
    expect(screen.getByText('Dream bag')).toBeTruthy();
    expect(screen.queryByText('White shirt')).toBeNull();
    expect(screen.getByTestId('wishlist-total')).toHaveTextContent(/4.000.*1 without a price/);
    expect(useClosetTab.getState().tab).toBe('wishlist');
  });

  it('explains an empty wishlist and offers to add from a link', async () => {
    mockItems = [item('shirt')];
    renderWithQuery(<ClosetScreen />);
    await screen.findByText('Item shirt');
    fireEvent.press(screen.getByTestId('closet-tab-wishlist'));
    await settle();
    expect(screen.getByText('Your wishlist is empty')).toBeTruthy();
    fireEvent.press(screen.getByText('Add from a shop link'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/item/link',
      params: { target: 'wishlist' },
    });
  });

  it('saves a new item to the wishlist when it is added from the Wishlist tab', async () => {
    mockParams = { source: 'library', target: 'wishlist' };
    mockPickPhoto.mockResolvedValue({
      status: 'picked',
      photo: { uri: 'file:///tmp/p.jpg', width: 10, height: 10 },
    });
    mockTagItem.mockResolvedValue({
      name: 'Coat',
      category: 'outerwear',
      subcategory: null,
      colours: [],
      seasons: [],
      occasions: [],
      warmth: null,
      brand: null,
    });
    renderWithQuery(<NewItemScreen />);
    expect(await screen.findByTestId('saving-to-wishlist')).toBeTruthy();
    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    expect(mockRepo.create.mock.calls[0][2]).toEqual({ ownership: 'wishlist' });
  });

  it('does not send a new item to the wishlist just because the Wishlist tab was left open', async () => {
    useClosetTab.setState({ tab: 'wishlist' });
    mockParams = { source: 'library' };
    mockPickPhoto.mockResolvedValue({
      status: 'picked',
      photo: { uri: 'file:///tmp/p.jpg', width: 10, height: 10 },
    });
    mockTagItem.mockResolvedValue({
      name: 'Coat',
      category: 'outerwear',
      subcategory: null,
      colours: [],
      seasons: [],
      occasions: [],
      warmth: null,
      brand: null,
    });
    renderWithQuery(<NewItemScreen />);
    fireEvent.press(await screen.findByTestId('item-save'));
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    expect(mockRepo.create.mock.calls[0][2]).toEqual({ ownership: 'owned' });
  });

  it('offers no archive action for wishlist items', async () => {
    mockItems = [item('coat', { ownership: 'wishlist' })];
    mockParams = { id: 'coat' };
    renderWithQuery(<ItemScreen />);
    await screen.findByTestId('item-wishlist');
    expect(screen.queryByTestId('item-archive')).toBeNull();
  });

  it('marks a wishlist item as bought with the price paid', async () => {
    mockItems = [item('coat', { ownership: 'wishlist', price: 4000, currency: 'CZK' })];
    mockParams = { id: 'coat' };
    renderWithQuery(<ItemScreen />);
    expect(await screen.findByTestId('item-wishlist')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('item-bought-price'), '3500');
    fireEvent.press(screen.getByTestId('item-bought'));
    await waitFor(() => expect(mockRepo.markBought).toHaveBeenCalled());
    expect(mockRepo.markBought.mock.calls[0]).toEqual([
      'coat',
      { price: 3500, currency: 'CZK', purchasedAt: expect.any(Number) },
    ]);
    await waitFor(() => expect(screen.queryByTestId('item-wishlist')).toBeNull());
  });
});

describe('closet screen', () => {
  const seed = () => {
    mockItems = [
      item('shirt', {
        name: 'White shirt',
        brand: 'Arket',
        colours: ['white'],
        seasons: ['summer'],
      }),
      item('skirt', {
        name: 'Pink skirt',
        category: 'bottoms',
        colours: ['pink'],
        seasons: ['summer'],
      }),
      item('boots', { name: 'Black boots', category: 'shoes', colours: ['black'] }),
    ];
  };

  it('explains the empty closet and offers to add the first item', async () => {
    renderWithQuery(<ClosetScreen />);
    expect(await screen.findByText('Your closet is empty')).toBeTruthy();
    fireEvent.press(screen.getByText('Add your first item'));
    expect(useAddActions.getState().menuOpen).toBe(true);
  });

  it('shows items with brand or name and the total count', async () => {
    seed();
    renderWithQuery(<ClosetScreen />);
    expect(await screen.findByText('Arket')).toBeTruthy();
    expect(screen.getByText('Pink skirt')).toBeTruthy();
    expect(screen.getByTestId('closet-count')).toHaveTextContent('3 items');
  });

  it('filters by category chip and clears it when tapped again', async () => {
    seed();
    renderWithQuery(<ClosetScreen />);
    await screen.findByText('Arket');

    fireEvent.press(screen.getByTestId('closet-category-shoes'));
    await settle();
    expect(screen.queryByText('Arket')).toBeNull();
    expect(screen.getByText('Black boots')).toBeTruthy();
    expect(screen.getByTestId('closet-category-shoes')).toBeChecked();
    expect(screen.getByTestId('closet-count')).toHaveTextContent('1 of 3 items');

    fireEvent.press(screen.getByTestId('closet-category-shoes'));
    expect(await screen.findByText('Arket')).toBeTruthy();
  });

  it('searches by brand and offers to clear when nothing is found', async () => {
    seed();
    renderWithQuery(<ClosetScreen />);
    await screen.findByText('Arket');

    fireEvent.changeText(screen.getByTestId('closet-search'), 'arket');
    expect(screen.queryByText('Pink skirt')).toBeNull();
    expect(screen.getByText('Arket')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('closet-search'), 'velvet');
    expect(screen.getByText('Nothing found')).toBeTruthy();
    fireEvent.press(screen.getByText('Clear search and filters'));
    expect(screen.getByText('Pink skirt')).toBeTruthy();
  });

  it('combines filters from the sheet and shows how many are active', async () => {
    seed();
    renderWithQuery(<ClosetScreen />);
    await screen.findByText('Arket');

    fireEvent.press(screen.getByTestId('open-filters'));
    fireEvent.press(screen.getByTestId('filter-colour-pink'));
    fireEvent.press(screen.getByTestId('filter-season-summer'));
    fireEvent.press(screen.getByTestId('filter-done'));

    await settle();
    expect(screen.queryByText('Arket')).toBeNull();
    expect(screen.getByText('Pink skirt')).toBeTruthy();
    expect(screen.getByText('Filters (2)')).toBeTruthy();
    expect(mockRepo.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ colours: ['pink'], seasons: ['summer'] }),
    );
  });

  it('opens an item on tap', async () => {
    seed();
    renderWithQuery(<ClosetScreen />);
    fireEvent.press(await screen.findByTestId('closet-item-skirt'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/item/[id]',
      params: { id: 'skirt' },
    });
  });

  it('deletes several selected items after a confirmation that states the number', async () => {
    seed();
    const alert = confirmAlerts();
    renderWithQuery(<ClosetScreen />);
    fireEvent(await screen.findByTestId('closet-item-shirt'), 'longPress');
    fireEvent.press(screen.getByTestId('closet-item-skirt'));
    fireEvent.press(screen.getByTestId('closet-item-boots'));
    expect(screen.getByText('3 selected')).toBeTruthy();

    fireEvent.press(screen.getByTestId('selection-delete'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('Delete 3 items?');
    expect(alert.mock.calls[0][1]).not.toMatch(/Outfits using/);
    await waitFor(() => expect(mockRepo.remove).toHaveBeenCalledWith(['shirt', 'skirt', 'boots']));
    expect(await screen.findByText('Your closet is empty')).toBeTruthy();
  });

  it('archives and re-tags selected items', async () => {
    seed();
    renderWithQuery(<ClosetScreen />);
    fireEvent(await screen.findByTestId('closet-item-shirt'), 'longPress');
    fireEvent.press(screen.getByTestId('selection-retag'));
    fireEvent.press(screen.getByTestId('retag-season-winter'));
    fireEvent.press(screen.getByTestId('retag-apply'));
    await waitFor(() =>
      expect(mockRepo.updateMany).toHaveBeenCalledWith(['shirt'], { seasons: ['winter'] }),
    );

    fireEvent(await screen.findByTestId('closet-item-skirt'), 'longPress');
    fireEvent.press(screen.getByTestId('selection-archive'));
    await waitFor(() => expect(mockRepo.archive).toHaveBeenCalledWith(['skirt']));
    await waitFor(() => expect(screen.queryByText('Pink skirt')).toBeNull());
  });

  it('shows how many imported items need review, with a shortcut', async () => {
    mockItems = [item('a', { needsReview: true }), item('b', { needsReview: true })];
    renderWithQuery(<ClosetScreen />);
    expect(await screen.findByText('2 imported items need review')).toBeTruthy();
    fireEvent.press(screen.getByTestId('review-banner'));
    expect(mockRouter.push).toHaveBeenCalledWith('/import/review');
  });

  it('shows an import indicator on every section while an import runs, and none otherwise', () => {
    const idle = render(<ImportIndicator />);
    expect(screen.queryByTestId('import-indicator')).toBeNull();
    idle.unmount();

    Object.assign(mockProgress, { queued: 12, processing: 2, done: 6, total: 20 });
    render(<ImportIndicator />);
    expect(screen.getByText('Importing 6 of 20')).toBeTruthy();
    fireEvent.press(screen.getByTestId('import-indicator'));
    expect(mockRouter.push).toHaveBeenCalledWith('/import');
  });
});

describe('adding an item from a photo', () => {
  const tags = {
    name: 'Pink skirt',
    category: 'bottoms',
    subcategory: 'skirt',
    colours: ['pink'],
    seasons: ['summer'],
    occasions: ['party'],
    warmth: 2,
    brand: null,
  };
  const photo = { uri: 'file:///tmp/photo.jpg', width: 100, height: 100 };

  it('shows a capture tip before the photo is taken', async () => {
    renderWithQuery(<NewItemScreen />);
    expect(await screen.findByTestId('capture-tip')).toHaveTextContent(/plain background/);
  });

  it('pre-fills suggestions, marks them, and saves the confirmed item', async () => {
    mockParams = { source: 'camera' };
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    mockTagItem.mockResolvedValue(tags);
    renderWithQuery(<NewItemScreen />);

    // The camera opens only after the tip has been shown.
    expect(screen.getByTestId('capture-tip')).toBeTruthy();
    expect(mockPickPhoto).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('add-item-camera'));

    expect(await screen.findByTestId('item-name')).toHaveProp('value', 'Pink skirt');
    expect(screen.getByTestId('category-bottoms')).toBeChecked();
    expect(screen.getByTestId('suggested-category')).toBeTruthy();
    expect(screen.getByTestId('suggested-colours')).toBeTruthy();
    expect(screen.getByTestId('item-preview')).toHaveProp('source', { uri: 'file:///tmp/cut.png' });

    // Changing a suggested value removes its mark.
    fireEvent.press(screen.getByTestId('colour-white'));
    expect(screen.queryByTestId('suggested-colours')).toBeNull();

    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    expect(mockRepo.create.mock.calls[0]).toEqual([
      expect.objectContaining({
        name: 'Pink skirt',
        category: 'bottoms',
        colours: ['pink', 'white'],
      }),
      expect.objectContaining({ cutoutPath: 'images/items/n.png' }),
      { ownership: 'owned' },
    ]);
    expect(mockStoreImages.mock.calls[0][0]).toEqual({
      originalUri: photo.uri,
      cutoutUri: 'file:///tmp/cut.png',
    });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('lets the user keep the original photo instead of the cutout', async () => {
    mockParams = { source: 'library' };
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    mockTagItem.mockResolvedValue(tags);
    renderWithQuery(<NewItemScreen />);

    fireEvent.press(await screen.findByTestId('image-choice-original'));
    expect(screen.getByTestId('item-preview')).toHaveProp('source', { uri: photo.uri });
    fireEvent.press(screen.getByTestId('item-save'));

    await waitFor(() => expect(mockStoreImages).toHaveBeenCalled());
    expect(mockStoreImages.mock.calls[0][0]).toEqual({ originalUri: photo.uri, cutoutUri: null });
  });

  it('uses the original photo and says why when no cutout is possible', async () => {
    mockParams = { source: 'library' };
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    mockCutout.mockResolvedValue(null);
    mockTagItem.mockResolvedValue(tags);
    renderWithQuery(<NewItemScreen />);
    expect(await screen.findByTestId('no-cutout-notice')).toBeTruthy();
    expect(screen.getByTestId('item-preview')).toHaveProp('source', { uri: photo.uri });
  });

  it('opens an empty form with a notice when tagging is unavailable, and still saves', async () => {
    const { AiUnavailableError } = jest.requireMock('@/ai/client');
    mockParams = { source: 'library' };
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    mockTagItem.mockRejectedValue(new AiUnavailableError('noKey'));
    renderWithQuery(<NewItemScreen />);

    expect(await screen.findByTestId('tags-unavailable')).toHaveTextContent(
      /need an Anthropic key/,
    );
    expect(screen.getByTestId('item-name')).toHaveProp('value', '');
    expect(screen.queryByTestId('suggested-category')).toBeNull();

    // Without a category the item is not saved and the field is marked.
    fireEvent.press(screen.getByTestId('item-save'));
    expect(screen.getByTestId('item-form-error')).toHaveTextContent('Choose a category.');
    expect(mockRepo.create).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('category-shoes'));
    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
  });

  it('leaves the screen when the first photo is cancelled', async () => {
    mockParams = { source: 'library' };
    mockPickPhoto.mockResolvedValue({ status: 'cancelled' });
    renderWithQuery(<NewItemScreen />);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it('prefers details read from a shop page over guesses from the photo', async () => {
    mockParams = { source: 'link' };
    usePendingLink.getState().set({
      uri: 'file:///cache/link.jpg',
      name: 'Linen Shirt',
      brand: 'Arket',
      price: 1290,
      currency: 'CZK',
      sourceUrl: 'https://shop.example/p/1?ref=a%26b',
      target: 'owned',
    });
    mockTagItem.mockResolvedValue({ ...tags, name: 'Some shirt', brand: 'Guess' });
    renderWithQuery(<NewItemScreen />);

    expect(await screen.findByTestId('item-name')).toHaveProp('value', 'Linen Shirt');
    expect(screen.getByTestId('item-brand')).toHaveProp('value', 'Arket');
    expect(screen.getByTestId('item-price')).toHaveProp('value', '1290');
    expect(screen.queryByTestId('suggested-name')).toBeNull();

    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());
    expect(mockRepo.create.mock.calls[0][0]).toMatchObject({
      price: 1290,
      currency: 'CZK',
      sourceUrl: 'https://shop.example/p/1?ref=a%26b',
    });
    // The handed-over data is used once.
    expect(usePendingLink.getState().pending).toBeNull();
  });
});

describe('importing from a shop link', () => {
  const product = {
    name: 'Linen Shirt',
    brand: 'Arket',
    price: 1290,
    currency: 'CZK',
    images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
    url: 'https://shop.example/p/1',
  };

  it('shows found images and details, then continues with the chosen image', async () => {
    mockFetchProduct.mockResolvedValue(product);
    renderWithQuery(<LinkImportScreen />);
    fireEvent.changeText(screen.getByTestId('link-input'), 'shop.example/p/1');
    fireEvent.press(screen.getByTestId('link-fetch'));

    expect(await screen.findByText('Linen Shirt')).toBeTruthy();
    expect(screen.getByText('Arket · 1290 CZK')).toBeTruthy();
    fireEvent.press(screen.getByTestId('link-image-1'));
    expect(screen.getByTestId('link-image-1')).toBeSelected();
    fireEvent.press(screen.getByTestId('link-continue'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/item/new',
      params: { source: 'link' },
    });
    expect(usePendingLink.getState().pending).toMatchObject({
      name: 'Linen Shirt',
      brand: 'Arket',
      price: 1290,
      currency: 'CZK',
      sourceUrl: 'https://shop.example/p/1',
    });
    const { downloadAsync } = jest.requireMock('expo-file-system/legacy');
    expect(downloadAsync.mock.calls[0][0]).toBe('https://cdn.example/b.jpg');
  });

  it('offers to use a web link found on the clipboard', async () => {
    Object.assign(mockClipboard, { hasUrl: true, url: 'https://shop.example/p/9' });
    mockFetchProduct.mockResolvedValue(product);
    renderWithQuery(<LinkImportScreen />);
    fireEvent.press(await screen.findByTestId('link-use-clipboard'));
    await waitFor(() => expect(mockFetchProduct).toHaveBeenCalledWith('https://shop.example/p/9'));
  });

  it('explains an unreadable page and offers the photo path instead', async () => {
    const { LinkImportError } = jest.requireActual('../productPage');
    mockFetchProduct.mockRejectedValue(new LinkImportError('noProduct'));
    renderWithQuery(<LinkImportScreen />);
    fireEvent.changeText(screen.getByTestId('link-input'), 'https://blog.example');
    fireEvent.press(screen.getByTestId('link-fetch'));

    expect(await screen.findByTestId('link-error')).toHaveTextContent(/No product was found/);
    fireEvent.press(screen.getByTestId('link-fallback'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/item/new',
      params: { source: 'library', target: 'owned' },
    });
  });
});

describe('bulk import screens', () => {
  it('shows progress and lets a failed photo be retried', async () => {
    Object.assign(mockProgress, { queued: 3, processing: 2, done: 14, failed: 1, total: 20 });
    mockJobs.list.mockResolvedValue([
      { id: 'j9', status: 'failed', sourcePath: 'x', error: 'bad' },
    ]);
    renderWithQuery(<ImportScreen />);

    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      '14 done · 2 in progress · 3 waiting',
    );
    fireEvent.press(await screen.findByTestId('import-retry-0'));
    expect(mockRetry).toHaveBeenCalledWith('j9');
  });

  it('steps through unconfirmed items: confirm, then discard', async () => {
    mockItems = [
      item('second', { needsReview: true, name: 'Second', createdAt: 2 }),
      item('first', { needsReview: true, name: 'First', createdAt: 1 }),
    ];
    renderWithQuery(<ReviewScreen />);

    expect(await screen.findByTestId('item-name')).toHaveProp('value', 'First');
    expect(screen.getByTestId('review-progress')).toHaveTextContent('1 of 2');
    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() =>
      expect(mockRepo.update).toHaveBeenCalledWith(
        'first',
        expect.objectContaining({ name: 'First', needsReview: false }),
      ),
    );

    await waitFor(() => expect(screen.getByTestId('item-name')).toHaveProp('value', 'Second'));
    expect(screen.getByTestId('review-progress')).toHaveTextContent('2 of 2');
    // The next item has been on screen long enough to have been seen.
    await sinceLastAction();
    await act(async () => {
      fireEvent.press(screen.getByTestId('review-discard'));
    });
    expect(mockRepo.remove).toHaveBeenCalledWith(['second']);
    expect(await screen.findByText('Everything is reviewed.')).toBeTruthy();
  });

  it('discards one item when Discard is tapped twice', async () => {
    mockItems = [
      item('third', { needsReview: true, name: 'Third', createdAt: 3 }),
      item('second', { needsReview: true, name: 'Second', createdAt: 2 }),
      item('first', { needsReview: true, name: 'First', createdAt: 1 }),
    ];
    renderWithQuery(<ReviewScreen />);
    expect(await screen.findByTestId('item-name')).toHaveProp('value', 'First');

    // The second tap lands when the next item is already the one on screen.
    await act(async () => {
      fireEvent.press(screen.getByTestId('review-discard'));
      fireEvent.press(screen.getByTestId('review-discard'));
    });
    await waitFor(() => expect(screen.getByTestId('item-name')).toHaveProp('value', 'Second'));
    expect(mockRepo.remove).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).toHaveBeenCalledWith(['first']);
    expect(mockItems.map((entry) => entry.id)).toEqual(['third', 'second']);
    expect(screen.getByTestId('review-progress')).toHaveTextContent('2 of 3');

    // A moment later the item that is shown can be discarded as usual.
    await sinceLastAction();
    await act(async () => {
      fireEvent.press(screen.getByTestId('review-discard'));
    });
    expect(mockRepo.remove).toHaveBeenCalledTimes(2);
    expect(mockRepo.remove).toHaveBeenLastCalledWith(['second']);
    await waitFor(() => expect(screen.getByTestId('item-name')).toHaveProp('value', 'Third'));
  });

  it('confirms one item when Confirm is tapped again as the next item appears', async () => {
    mockItems = [
      item('third', { needsReview: true, name: 'Third', createdAt: 3 }),
      item('second', { needsReview: true, name: 'Second', createdAt: 2 }),
      item('first', { needsReview: true, name: 'First', createdAt: 1 }),
    ];
    renderWithQuery(<ReviewScreen />);
    expect(await screen.findByTestId('item-name')).toHaveProp('value', 'First');

    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(screen.getByTestId('item-name')).toHaveProp('value', 'Second'));
    fireEvent.press(screen.getByTestId('item-save'));
    await settle();
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledWith(
      'first',
      expect.objectContaining({ needsReview: false }),
    );
    expect(mockItems.find((entry) => entry.id === 'second')?.needsReview).toBe(true);
    expect(screen.getByTestId('item-name')).toHaveProp('value', 'Second');
    expect(screen.getByTestId('review-progress')).toHaveTextContent('2 of 3');

    await sinceLastAction();
    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() => expect(screen.getByTestId('item-name')).toHaveProp('value', 'Third'));
    expect(mockRepo.update).toHaveBeenCalledTimes(2);
    expect(mockRepo.update).toHaveBeenLastCalledWith(
      'second',
      expect.objectContaining({ needsReview: false }),
    );
  });

  it('confirms one item when two confirmations arrive before the screen is drawn again', async () => {
    mockItems = [
      item('second', { needsReview: true, name: 'Second', createdAt: 2 }),
      item('first', { needsReview: true, name: 'First', createdAt: 1 }),
    ];
    renderWithQuery(<ReviewScreen />);
    expect(await screen.findByTestId('item-name')).toHaveProp('value', 'First');

    const submit = screen.UNSAFE_getByType(ItemForm).props.onSubmit as (details: object) => void;
    await act(async () => {
      submit({ name: 'First' });
      submit({ name: 'First' });
    });
    await waitFor(() => expect(screen.getByTestId('item-name')).toHaveProp('value', 'Second'));
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });
});

describe('item detail', () => {
  const full = item('coat', {
    name: 'Wool coat',
    brand: 'COS',
    category: 'outerwear',
    subcategory: 'coat',
    colours: ['navy'],
    price: 4990,
    currency: 'CZK',
    sourceUrl: 'https://shop.example/coat',
  });

  it('shows the details', async () => {
    mockItems = [full];
    mockParams = { id: 'coat' };
    renderWithQuery(<ItemScreen />);
    expect(await screen.findByTestId('item-title')).toHaveTextContent('Wool coat');
    expect(screen.getByText('Outerwear · Coat')).toBeTruthy();
    expect(screen.getByText('Navy')).toBeTruthy();
    expect(screen.getByTestId('item-open-source')).toBeTruthy();
  });

  it('edits a detail and shows the new value', async () => {
    mockItems = [full];
    mockParams = { id: 'coat' };
    renderWithQuery(<ItemScreen />);
    fireEvent.press(await screen.findByTestId('item-edit'));
    fireEvent.changeText(screen.getByTestId('item-brand'), 'Arket');
    fireEvent.press(screen.getByTestId('item-save'));
    await waitFor(() =>
      expect(mockRepo.update).toHaveBeenCalledWith(
        'coat',
        expect.objectContaining({ brand: 'Arket' }),
      ),
    );
    expect(await screen.findByText('Arket')).toBeTruthy();
  });

  it('archives the item', async () => {
    mockItems = [full];
    mockParams = { id: 'coat' };
    renderWithQuery(<ItemScreen />);
    fireEvent.press(await screen.findByTestId('item-archive'));
    await waitFor(() => expect(mockRepo.archive).toHaveBeenCalledWith(['coat']));
    expect(await screen.findByTestId('item-archived')).toBeTruthy();
  });

  it('deletes the item after confirmation and offers undo', async () => {
    mockItems = [full];
    mockParams = { id: 'coat' };
    confirmAlerts();
    renderWithQuery(<ItemScreen />);
    fireEvent.press(await screen.findByTestId('item-delete'));
    await waitFor(() => expect(mockRepo.remove).toHaveBeenCalledWith(['coat']));
    expect(mockRouter.back).toHaveBeenCalled();
    const { useToast } = jest.requireActual('@/shell/toast');
    expect(useToast.getState().toast).toMatchObject({
      message: 'Item deleted',
      actionLabel: 'Undo',
    });
  });

  it('warns how many outfits are affected before deleting a used item', async () => {
    mockItems = [full];
    mockParams = { id: 'coat' };
    mockCountUsing.mockResolvedValueOnce(2);
    const alert = confirmAlerts();
    renderWithQuery(<ItemScreen />);
    fireEvent.press(await screen.findByTestId('item-delete'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toMatch(/Outfits using this item: 2/);
    expect(mockCountUsing).toHaveBeenCalledWith(['coat']);
  });

  it('starts an outfit from the item', async () => {
    mockItems = [full];
    mockParams = { id: 'coat' };
    renderWithQuery(<ItemScreen />);
    fireEvent.press(await screen.findByTestId('item-create-outfit'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/outfit/edit',
      params: { itemId: 'coat' },
    });
  });

  it('says so when the item no longer exists', async () => {
    mockParams = { id: 'gone' };
    renderWithQuery(<ItemScreen />);
    expect(await screen.findByText('This item no longer exists.')).toBeTruthy();
  });
});
