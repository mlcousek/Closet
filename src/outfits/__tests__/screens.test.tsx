import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import OutfitsScreen from '@/app/(tabs)/outfits';
import OutfitScreen from '@/app/outfit/[id]';
import OutfitEditorScreen from '@/app/outfit/edit';
import type { Item } from '@/closet/types';
import type { Profile } from '@/profile/types';
import { useToast } from '@/shell/toast';

import { OutfitImage } from '../OutfitImage';
import { RenderSettings } from '../RenderSettings';
import type { Outfit } from '../repository';
import type { Render } from '../renders';
import { StudioAvatar } from '../StudioAvatar';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
/** What the editor last passed to usePreventRemove: whether leaving is blocked, and its callback. */
const mockPrevent: {
  blocked: boolean;
  callback: ((options: { data: { action: object } }) => void) | null;
} = { blocked: false, callback: null };
const mockNavigation = { dispatch: jest.fn() };
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (
    blocked: boolean,
    callback: (options: { data: { action: object } }) => void,
  ) => {
    mockPrevent.blocked = blocked;
    mockPrevent.callback = callback;
  },
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: {
    uri: (path: string) => `file:///documents/${path}`,
    remove: jest.fn(async () => {}),
  },
}));

const item = (id: string, category: Item['category'], patch: Partial<Item> = {}): Item => ({
  id,
  createdAt: 1,
  name: id,
  category,
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
  cutoutPath: null,
  thumbPath: `images/items/${id}-t.jpg`,
  needsReview: false,
  ...patch,
});

const closet = [
  item('shirt', 'tops', { seasons: ['summer'] }),
  item('jumper', 'tops', { seasons: ['winter'] }),
  item('skirt', 'bottoms'),
  item('dress', 'dresses'),
  item('boots', 'shoes'),
  item('scarf', 'accessories'),
  item('hat', 'accessories'),
];
let mockOwned: Item[] = closet;
let mockWished: Item[] = [];
jest.mock('@/closet/useItems', () => ({
  useItems: (filter: { ownership?: string } = {}) => ({
    data: filter.ownership === 'wishlist' ? mockWished : mockOwned,
  }),
  useItem: (id?: string) => ({
    data: id ? (mockOwned.find((entry) => entry.id === id) ?? null) : undefined,
    isPending: false,
  }),
}));

const entry = (source: Item, slot: Outfit['entries'][number]['slot']) => ({
  item: source,
  slot,
  position: 0,
});
const outfitOf = (id: string, patch: Partial<Outfit> = {}): Outfit => ({
  id,
  createdAt: 1,
  name: null,
  notes: null,
  favourite: false,
  seasons: [],
  occasions: [],
  entries: [entry(closet[0], 'top'), entry(closet[2], 'bottom'), entry(closet[4], 'shoes')],
  ...patch,
});

let mockOutfits: Outfit[] = [];
const mockOutfitRepo = {
  list: jest.fn(async (filter: { favourite?: boolean } = {}) =>
    mockOutfits.filter((outfit) => !filter.favourite || outfit.favourite),
  ),
  get: jest.fn(async (id: string) => mockOutfits.find((outfit) => outfit.id === id) ?? null),
  create: jest.fn(async (pieces: { itemId: string; slot: string }[]) => {
    const created = outfitOf('new', {
      entries: pieces.map((piece) =>
        entry(
          closet.find((source) => source.id === piece.itemId)!,
          piece.slot as never,
        ),
      ),
    });
    mockOutfits = [created, ...mockOutfits];
    return created;
  }),
  setPieces: jest.fn(async (id: string) => mockOutfits.find((outfit) => outfit.id === id) ?? null),
  updateInfo: jest.fn(async (id: string, info: Partial<Outfit>) => {
    mockOutfits = mockOutfits.map((outfit) => (outfit.id === id ? { ...outfit, ...info } : outfit));
    return mockOutfits.find((outfit) => outfit.id === id) ?? null;
  }),
  duplicate: jest.fn(async () => outfitOf('copy')),
  remove: jest.fn(async (id: string) => {
    mockOutfits = mockOutfits.filter((outfit) => outfit.id !== id);
  }),
  restore: jest.fn(async () => {}),
};
jest.mock('../repository', () => ({
  hasWishlistItem: (outfit: { entries: { item: { ownership: string } }[] }) =>
    outfit.entries.some((candidate) => candidate.item.ownership === 'wishlist'),
  get outfitRepository() {
    return mockOutfitRepo;
  },
}));
jest.mock('@/lookbooks/useLookbooks', () => ({
  useLookbooks: () => ({ data: [] }),
  useLookbooksContaining: () => ({ data: [] }),
}));
jest.mock('@/lookbooks/LookbookPicker', () => {
  const { Text } = require('react-native');
  return { LookbookPicker: () => <Text testID="lookbook-picker">picker</Text> };
});
jest.mock('@/sharing/ShareSheet', () => {
  const { Text } = require('react-native');
  return { ShareSheet: () => <Text testID="share-sheet">share</Text> };
});

const doneRender = (id: string, outfitId: string, patch: Partial<Render> = {}): Render => ({
  id,
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  outfitId,
  status: 'done',
  fingerprint: 'fp',
  provider: 'gemini',
  imagePath: `images/renders/${id}.png`,
  thumbPath: `images/renders/${id}-t.jpg`,
  failure: null,
  ...patch,
});
let mockRenders: Render[] = [];
const mockUsage = { counts: jest.fn(async (_kind: string) => ({ month: 4, total: 19 })) };
jest.mock('../renders', () => ({
  ...jest.requireActual('../renders'),
  get renderRepository() {
    return { all: async () => mockRenders };
  },
  // Plain objects that look the mocks up when called: a getter here would be read too early.
  usageLog: { counts: (kind: string) => mockUsage.counts(kind) },
}));

const mockSettings = { auto: true, disclosed: true };
const mockRequestRender = jest.fn(async (..._args: unknown[]) => ({ kind: 'queued' }) as object);
const mockCreateStudio = jest.fn(async () => 'images/avatar/studio.png');
jest.mock('../renderActions', () => ({
  avatarBasePath: (profile: Profile | null) =>
    profile?.avatarStudioPath ?? profile?.avatarSmallPath ?? null,
  currentFingerprint: () => 'fp',
  useRenderVersion: (selector: (state: { version: number }) => unknown) => selector({ version: 1 }),
  isAutoRenderOn: () => mockSettings.auto,
  setAutoRender: (on: boolean) => {
    mockSettings.auto = on;
  },
  isDisclosed: () => mockSettings.disclosed,
  setDisclosed: () => {
    mockSettings.disclosed = true;
  },
  requestRender: (...args: unknown[]) => mockRequestRender(...args),
  createStudioAvatar: () => mockCreateStudio(),
}));

const profile: Profile = {
  id: 'p1',
  name: 'Auri',
  gender: 'woman',
  bodyType: 'average',
  heightCm: null,
  sizeTop: null,
  sizeBottom: null,
  sizeShoes: null,
  avatarPath: 'images/avatar/a.jpg',
  avatarSmallPath: 'images/avatar/a-small.jpg',
  avatarStudioPath: null,
};
let mockProfile: Profile | null = profile;
const mockSaveProfile = jest.fn(async (input: Partial<Profile>) => {
  mockProfile = { ...mockProfile!, ...input };
  return mockProfile;
});
jest.mock('@/profile/useProfile', () => ({
  useProfile: () => ({ data: mockProfile }),
  useSaveProfile: () => ({ mutateAsync: (input: object) => mockSaveProfile(input) }),
}));

const mockTextModel = { value: 'claude-opus-5-5' };
jest.mock('@/ai/client', () => ({
  DEFAULT_TEXT_MODEL: 'claude-opus-5-5',
  getTextModel: () => mockTextModel.value,
  setTextModel: (model: string) => {
    mockTextModel.value = model || 'claude-opus-5-5';
  },
}));
const mockImageModel = { value: 'gemini-2.5-flash-image' };
jest.mock('@/ai/tryOn', () => {
  class TryOnError extends Error {
    reason: string;
    constructor(mockReason: string) {
      super(mockReason);
      this.reason = mockReason;
    }
  }
  return {
    TryOnError,
    DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash-image',
    getImageModel: () => mockImageModel.value,
    setImageModel: (model: string) => {
      mockImageModel.value = model || 'gemini-2.5-flash-image';
    },
  };
});
jest.mock('@/ai/KeyNeededPrompt', () => {
  const { Text } = require('react-native');
  return { KeyNeededPrompt: () => <Text testID="key-needed">key needed</Text> };
});

const renderWithQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const settle = () =>
  act(async () => void (await new Promise((resolve) => setTimeout(resolve, 30))));

const answerAlert = (pick: 'confirm' | 'cancel') =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const button =
      pick === 'cancel'
        ? buttons?.find((candidate) => candidate.style === 'cancel')
        : buttons?.find((candidate) => candidate.style !== 'cancel');
    button?.onPress?.();
  });

const noSummary = { current: null, previous: null, pending: null, failed: null, outdated: false };

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockParams = {};
  mockOwned = closet;
  mockWished = [];
  mockOutfits = [];
  mockRenders = [];
  mockProfile = profile;
  Object.assign(mockPrevent, { blocked: false, callback: null });
  mockUsage.counts.mockResolvedValue({ month: 4, total: 19 });
  Object.assign(mockSettings, { auto: true, disclosed: true });
});

describe('outfit editor', () => {
  it('builds an outfit from slot rows, updates the preview at once, and saves it', async () => {
    renderWithQuery(<OutfitEditorScreen />);
    expect(screen.getByTestId('editor-empty')).toBeTruthy();
    expect(screen.getByTestId('editor-save')).toBeDisabled();

    fireEvent.press(screen.getByTestId('carousel-top-0-shirt'));
    expect(screen.getByTestId('collage-piece-shirt')).toBeTruthy();
    fireEvent.press(screen.getByTestId('carousel-bottom-0-skirt'));
    fireEvent.press(screen.getByTestId('carousel-shoes-0-boots'));
    expect(screen.getByTestId('carousel-shoes-0-boots')).toBeSelected();

    // Changing a piece changes the preview without delay.
    fireEvent.press(screen.getByTestId('carousel-top-0-jumper'));
    expect(screen.queryByTestId('collage-piece-shirt')).toBeNull();
    expect(screen.getByTestId('collage-piece-jumper')).toBeTruthy();

    fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() => expect(mockOutfitRepo.create).toHaveBeenCalled());
    expect(mockOutfitRepo.create.mock.calls[0][0]).toEqual([
      { itemId: 'jumper', slot: 'top', position: 0 },
      { itemId: 'skirt', slot: 'bottom', position: 0 },
      { itemId: 'boots', slot: 'shoes', position: 0 },
    ]);
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/outfit/[id]',
        params: { id: 'new' },
      }),
    );
    // Leaving after a save is not blocked by the unsaved-changes guard.
    expect(mockPrevent.blocked).toBe(false);
    expect(useToast.getState().toast?.message).toBe('Saved look');
    await waitFor(() => expect(mockRequestRender).toHaveBeenCalled());
  });

  it('selects the item a row comes to rest on after a swipe', () => {
    renderWithQuery(<OutfitEditorScreen />);
    // Two positions along: "none", shirt, jumper.
    fireEvent(screen.getByTestId('carousel-top-0'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 2 * 102, y: 0 } },
    });
    expect(screen.getByTestId('carousel-top-0-jumper')).toBeSelected();
  });

  it('clears top and bottom for a dress and says they are not needed', () => {
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('carousel-top-0-shirt'));
    fireEvent.press(screen.getByTestId('carousel-fullBody-0-dress'));
    expect(screen.getByTestId('slot-replaced-top')).toBeTruthy();
    expect(screen.getByTestId('slot-replaced-bottom')).toBeTruthy();
    expect(screen.queryByTestId('collage-piece-shirt')).toBeNull();
    expect(screen.getByTestId('collage-piece-dress')).toBeTruthy();
  });

  it('adds a second accessory', async () => {
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('carousel-accessory-0-scarf'));
    fireEvent.press(screen.getByTestId('slot-add-accessory'));
    fireEvent.press(screen.getByTestId('carousel-accessory-1-hat'));
    fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() => expect(mockOutfitRepo.create).toHaveBeenCalled());
    expect(mockOutfitRepo.create.mock.calls[0][0]).toEqual([
      { itemId: 'scarf', slot: 'accessory', position: 0 },
      { itemId: 'hat', slot: 'accessory', position: 1 },
    ]);
  });

  it('hides a slot so it contributes nothing, and shows it again', () => {
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('carousel-shoes-0-boots'));
    fireEvent.press(screen.getByTestId('slot-hide-shoes'));
    expect(screen.queryByTestId('collage-piece-boots')).toBeNull();
    expect(screen.queryByTestId('carousel-shoes-0')).toBeNull();
    fireEvent.press(screen.getByTestId('slot-hide-shoes'));
    expect(screen.getByTestId('collage-piece-boots')).toBeTruthy();
  });

  it('offers a shortcut to add an item when the closet has none for a slot', () => {
    mockOwned = closet.filter((entry) => entry.category !== 'shoes');
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('slot-empty-shoes'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/item/new',
      params: { source: 'camera' },
    });
  });

  it('narrows the rows by season but keeps what is already chosen', () => {
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('carousel-top-0-shirt'));
    fireEvent.press(screen.getByTestId('editor-season-winter'));
    // The summer shirt stays because it is selected; untagged items always stay.
    expect(screen.getByTestId('carousel-top-0-shirt')).toBeTruthy();
    expect(screen.getByTestId('carousel-top-0-jumper')).toBeTruthy();
    fireEvent.press(screen.getByTestId('carousel-top-0-jumper'));
    expect(screen.queryByTestId('carousel-top-0-shirt')).toBeNull();
    expect(screen.getByTestId('carousel-bottom-0-skirt')).toBeTruthy();
  });

  it('shuffles a combination into the preview', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('editor-shuffle'));
    expect(screen.getByTestId('editor-preview')).toBeTruthy();
    expect(screen.getByTestId('editor-save')).toBeEnabled();
  });

  it('offers wishlist pieces only on request and marks them', () => {
    mockWished = [item('dream-coat', 'outerwear', { ownership: 'wishlist' })];
    renderWithQuery(<OutfitEditorScreen />);
    expect(screen.queryByTestId('carousel-outer-0-dream-coat')).toBeNull();
    fireEvent.press(screen.getByTestId('editor-wishlist'));
    expect(screen.getByTestId('carousel-outer-0-dream-coat-wishlist')).toBeTruthy();
    fireEvent.press(screen.getByTestId('carousel-outer-0-dream-coat'));
    expect(screen.getByTestId('collage-piece-dream-coat')).toBeTruthy();
  });

  it('has no wishlist switch when the wishlist is empty', () => {
    renderWithQuery(<OutfitEditorScreen />);
    expect(screen.queryByTestId('editor-wishlist')).toBeNull();
  });

  it('opens with a closet item selected in its slot', () => {
    mockParams = { itemId: 'dress' };
    renderWithQuery(<OutfitEditorScreen />);
    expect(screen.getByTestId('carousel-fullBody-0-dress')).toBeSelected();
    expect(screen.getByTestId('collage-piece-dress')).toBeTruthy();
  });

  it('asks before leaving with unsaved changes and leaves the stored outfit alone', async () => {
    mockOutfits = [outfitOf('o1')];
    mockParams = { id: 'o1' };
    const alert = answerAlert('confirm');
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(await screen.findByTestId('carousel-top-0-jumper'));

    expect(mockPrevent.blocked).toBe(true);
    act(() => mockPrevent.callback?.({ data: { action: { type: 'GO_BACK' } } }));

    expect(alert.mock.calls[0][0]).toBe('Discard changes?');
    expect(mockNavigation.dispatch).toHaveBeenCalledWith({ type: 'GO_BACK' });
    expect(mockOutfitRepo.setPieces).not.toHaveBeenCalled();
  });

  it('leaves without asking when nothing changed', async () => {
    mockOutfits = [outfitOf('o1')];
    mockParams = { id: 'o1' };
    const alert = answerAlert('confirm');
    renderWithQuery(<OutfitEditorScreen />);
    await screen.findByTestId('carousel-top-0-shirt');
    expect(mockPrevent.blocked).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it('does not ask for a render on save when automatic rendering is off', async () => {
    mockSettings.auto = false;
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('carousel-top-0-shirt'));
    fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() => expect(mockOutfitRepo.create).toHaveBeenCalled());
    await settle();
    expect(mockRequestRender).not.toHaveBeenCalled();
  });

  it('shows a one-time notice before the first render and renders only after confirmation', async () => {
    mockSettings.disclosed = false;
    const alert = answerAlert('cancel');
    renderWithQuery(<OutfitEditorScreen />);
    fireEvent.press(screen.getByTestId('carousel-top-0-shirt'));
    fireEvent.press(screen.getByTestId('editor-save'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][0]).toBe('Send images to the image provider?');
    await settle();
    // The outfit is saved either way; only the render waits for consent.
    expect(mockOutfitRepo.create).toHaveBeenCalled();
    expect(mockRequestRender).not.toHaveBeenCalled();
    expect(mockSettings.disclosed).toBe(false);
  });
});

describe('outfit image', () => {
  const items = [closet[0], closet[2]];

  it('shows the flat preview when there is no render', () => {
    render(<OutfitImage items={items} summary={noSummary} />);
    expect(screen.getByTestId('outfit-collage')).toBeTruthy();
    expect(screen.queryByTestId('outfit-render')).toBeNull();
  });

  it('shows the render when there is one', () => {
    render(
      <OutfitImage items={items} summary={{ ...noSummary, current: doneRender('r1', 'o1') }} />,
    );
    expect(screen.getByTestId('outfit-render')).toHaveProp('source', {
      uri: 'file:///documents/images/renders/r1-t.jpg',
    });
  });

  it('marks in-progress, failed and outdated renders', () => {
    const pending = doneRender('r2', 'o1', { status: 'running', imagePath: null, thumbPath: null });
    const view = render(<OutfitImage items={items} summary={{ ...noSummary, pending }} />);
    expect(screen.getByTestId('render-pending')).toBeTruthy();
    expect(screen.getByTestId('outfit-collage')).toBeTruthy();

    const failed = doneRender('r3', 'o1', { status: 'failed', failure: 'declined' });
    view.rerender(<OutfitImage items={items} summary={{ ...noSummary, failed }} />);
    expect(screen.getByTestId('render-failed')).toBeTruthy();

    view.rerender(
      <OutfitImage
        items={items}
        summary={{ ...noSummary, current: doneRender('r1', 'o1'), outdated: true }}
      />,
    );
    expect(screen.getByTestId('render-outdated')).toBeTruthy();
  });
});

describe('outfits section', () => {
  it('explains the empty state and offers to create an outfit', async () => {
    renderWithQuery(<OutfitsScreen />);
    expect(await screen.findByText('No outfits yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Create an outfit'));
    expect(mockRouter.push).toHaveBeenCalledWith('/outfit/edit');
  });

  it('shows renders where they exist and the flat preview otherwise', async () => {
    mockOutfits = [outfitOf('o1', { name: 'Friday' }), outfitOf('o2')];
    mockRenders = [doneRender('r1', 'o1')];
    renderWithQuery(<OutfitsScreen />);
    expect(await screen.findByText('Friday')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId('outfit-render')).toHaveLength(1));
    expect(screen.getAllByTestId('outfit-collage')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('outfit-o2'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/outfit/[id]',
      params: { id: 'o2' },
    });
  });

  it('marks an outfit that contains a wishlist piece', async () => {
    const wished = item('dream-coat', 'outerwear', { ownership: 'wishlist' });
    mockOutfits = [outfitOf('o1', { entries: [entry(wished, 'outer')] }), outfitOf('o2')];
    renderWithQuery(<OutfitsScreen />);
    await waitFor(() => expect(screen.getAllByTestId('outfit-wishlist')).toHaveLength(1));
  });

  it('adds several selected outfits to a lookbook', async () => {
    mockOutfits = [outfitOf('o1'), outfitOf('o2')];
    renderWithQuery(<OutfitsScreen />);
    fireEvent(await screen.findByTestId('outfit-o1'), 'longPress');
    fireEvent.press(screen.getByTestId('outfit-o2'));
    expect(screen.getByText('2 selected')).toBeTruthy();
    fireEvent.press(screen.getByTestId('outfit-selection-lookbook'));
    expect(screen.getByTestId('lookbook-picker')).toBeTruthy();
  });

  it('filters by favourites', async () => {
    mockOutfits = [
      outfitOf('o1', { name: 'Loved', favourite: true }),
      outfitOf('o2', { name: 'Plain' }),
    ];
    renderWithQuery(<OutfitsScreen />);
    await screen.findByText('Plain');
    fireEvent.press(screen.getByTestId('outfit-filter-favourite'));
    await settle();
    expect(screen.queryByText('Plain')).toBeNull();
    expect(screen.getByText('Loved')).toBeTruthy();
  });
});

describe('outfit detail', () => {
  const open = (outfit: Outfit) => {
    mockOutfits = [outfit];
    mockParams = { id: outfit.id };
    renderWithQuery(<OutfitScreen />);
  };

  it('offers a first render and opens a piece on tap', async () => {
    open(outfitOf('o1'));
    fireEvent.press(await screen.findByText('Try it on me'));
    await waitFor(() => expect(mockRequestRender).toHaveBeenCalledWith(mockOutfits[0], false));
    fireEvent.press(screen.getByTestId('outfit-piece-skirt'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/item/[id]',
      params: { id: 'skirt' },
    });
  });

  it('regenerates on request and lets the user go back to the previous picture', async () => {
    mockRenders = [doneRender('r2', 'o1'), doneRender('r1', 'o1')];
    open(outfitOf('o1'));
    await waitFor(() =>
      expect(screen.getByTestId('outfit-render')).toHaveProp('source', {
        uri: 'file:///documents/images/renders/r2.png',
      }),
    );
    fireEvent.press(screen.getByText('Previous picture'));
    expect(screen.getByTestId('outfit-render')).toHaveProp('source', {
      uri: 'file:///documents/images/renders/r1.png',
    });
    fireEvent.press(screen.getByText('Regenerate'));
    await waitFor(() => expect(mockRequestRender).toHaveBeenCalledWith(mockOutfits[0], true));
  });

  it('keeps the previous render on show and explains when a regenerate was declined', async () => {
    mockRenders = [
      doneRender('r2', 'o1', { status: 'failed', failure: 'declined', imagePath: null }),
      doneRender('r1', 'o1'),
    ];
    open(outfitOf('o1'));
    expect(await screen.findByTestId('render-status')).toHaveTextContent(/declined to render/);
    expect(screen.getByTestId('outfit-render')).toHaveProp('source', {
      uri: 'file:///documents/images/renders/r1.png',
    });
  });

  it('says that nothing was charged when a render failed for lack of connection', async () => {
    mockRenders = [
      doneRender('r1', 'o1', { status: 'failed', failure: 'offline', imagePath: null }),
    ];
    open(outfitOf('o1'));
    expect(await screen.findByTestId('render-status')).toHaveTextContent(/nothing was charged/);
    expect(screen.getByTestId('outfit-collage')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('points to the key settings when the image key is missing', async () => {
    mockRenders = [doneRender('r1', 'o1', { status: 'failed', failure: 'noKey', imagePath: null })];
    open(outfitOf('o1'));
    expect(await screen.findByTestId('key-needed')).toBeTruthy();
  });

  it('shows progress while rendering and disables another request', async () => {
    mockRenders = [doneRender('r1', 'o1', { status: 'running', imagePath: null, thumbPath: null })];
    open(outfitOf('o1'));
    expect(await screen.findByTestId('render-status')).toHaveTextContent(/keep using the app/);
    expect(screen.getByTestId('outfit-render-button')).toBeDisabled();
  });

  it('renames and marks as favourite', async () => {
    open(outfitOf('o1'));
    fireEvent.changeText(await screen.findByTestId('outfit-name'), 'Friday night');
    fireEvent.press(screen.getByTestId('outfit-rename'));
    await waitFor(() =>
      expect(mockOutfitRepo.updateInfo).toHaveBeenCalledWith('o1', { name: 'Friday night' }),
    );
    // Renaming gives the screen a fresh view; wait for it before the next tap.
    await settle();
    fireEvent.press(screen.getByTestId('outfit-favourite'));
    await waitFor(() =>
      expect(mockOutfitRepo.updateInfo).toHaveBeenCalledWith('o1', { favourite: true }),
    );
  });

  it('marks archived pieces', async () => {
    const archived = { ...closet[0], ownership: 'archived' as const };
    open(outfitOf('o1', { entries: [entry(archived, 'top')] }));
    expect(await screen.findByTestId('piece-archived-shirt')).toBeTruthy();
  });

  it('opens the share sheet and the lookbook picker', async () => {
    open(outfitOf('o1'));
    fireEvent.press(await screen.findByTestId('outfit-share'));
    expect(screen.getByTestId('share-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('outfit-lookbooks'));
    expect(screen.getByTestId('lookbook-picker')).toBeTruthy();
  });

  it('duplicates into the editor', async () => {
    open(outfitOf('o1'));
    fireEvent.press(await screen.findByTestId('outfit-duplicate'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/outfit/edit',
        params: { id: 'copy' },
      }),
    );
  });

  it('deletes after confirmation and offers undo', async () => {
    answerAlert('confirm');
    open(outfitOf('o1'));
    fireEvent.press(await screen.findByTestId('outfit-delete'));
    await waitFor(() => expect(mockOutfitRepo.remove).toHaveBeenCalledWith('o1'));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(useToast.getState().toast).toMatchObject({
      message: 'Outfit deleted',
      actionLabel: 'Undo',
    });
  });
});

describe('render settings', () => {
  it('shows usage and turns automatic rendering off', async () => {
    renderWithQuery(<RenderSettings />);
    await settle();
    expect(screen.getByTestId('render-usage')).toHaveTextContent(
      '4 renders this month · 19 in total',
    );
    fireEvent(screen.getByTestId('auto-render'), 'valueChange', false);
    expect(mockSettings.auto).toBe(false);
  });

  it('stores another image model', () => {
    renderWithQuery(<RenderSettings />);
    expect(screen.getByTestId('image-model')).toHaveProp('value', '');
    fireEvent.changeText(screen.getByTestId('image-model'), 'gemini-next-image');
    expect(mockImageModel.value).toBe('gemini-next-image');
    mockImageModel.value = 'gemini-2.5-flash-image';
  });
});

describe('studio avatar', () => {
  it('uses the studio photo as the base once the user accepts it', async () => {
    render(<StudioAvatar profile={profile} />);
    fireEvent.press(screen.getByTestId('studio-create'));
    expect(await screen.findByTestId('studio-preview')).toHaveProp('source', {
      uri: 'file:///documents/images/avatar/studio.png',
    });
    expect(mockSaveProfile).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('studio-accept'));
    await waitFor(() =>
      expect(mockSaveProfile).toHaveBeenCalledWith({
        avatarStudioPath: 'images/avatar/studio.png',
      }),
    );
  });

  it('discards a rejected studio photo and keeps the original as the base', async () => {
    const { imageStore } = jest.requireMock('@/storage/imageStore');
    render(<StudioAvatar profile={profile} />);
    fireEvent.press(screen.getByTestId('studio-create'));
    fireEvent.press(await screen.findByTestId('studio-reject'));
    await waitFor(() => expect(imageStore.remove).toHaveBeenCalledWith('images/avatar/studio.png'));
    expect(mockSaveProfile).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('studio-preview')).toBeNull());
  });

  it('asks for a key when none is stored', async () => {
    const { TryOnError } = jest.requireMock('@/ai/tryOn');
    mockCreateStudio.mockRejectedValueOnce(new TryOnError('noKey'));
    render(<StudioAvatar profile={profile} />);
    fireEvent.press(screen.getByTestId('studio-create'));
    expect(await screen.findByTestId('key-needed')).toBeTruthy();
  });

  it('goes back to the original photo', async () => {
    render(<StudioAvatar profile={{ ...profile, avatarStudioPath: 'images/avatar/s.png' }} />);
    expect(screen.getByTestId('studio-in-use')).toBeTruthy();
    fireEvent.press(screen.getByTestId('studio-remove'));
    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalledWith({ avatarStudioPath: null }));
  });

  it('is not offered without an avatar photo', () => {
    render(<StudioAvatar profile={{ ...profile, avatarSmallPath: null }} />);
    expect(screen.queryByTestId('studio-avatar')).toBeNull();
  });
});
