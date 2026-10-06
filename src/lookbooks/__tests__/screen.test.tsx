import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import LookbookScreen from '@/app/lookbook/[id]';
import type { Item } from '@/closet/types';
import type { Render, RenderSummary } from '@/outfits/renders';
import type { Outfit } from '@/outfits/repository';
import { ToastHost } from '@/shell/ToastHost';

import type { Lookbook } from '../repository';

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-sqlite', () => ({}));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));
jest.mock('react-native-view-shot', () => ({ captureRef: async () => 'file:///tmp/card.png' }));
const mockShare = jest.fn(async (..._args: unknown[]) => {});
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShare(...args) }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: async () => ({ granted: true }),
  Asset: { create: async () => ({}) },
}));

const mockRouter = { push: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const piece = (id: string): Item => ({
  id,
  createdAt: 1,
  name: id,
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
  originalPath: `${id}.jpg`,
  cutoutPath: null,
  thumbPath: `${id}-thumb.jpg`,
  needsReview: false,
});
const outfit = (id: string, name: string | null = id.toUpperCase()): Outfit => ({
  id,
  createdAt: 1,
  name,
  notes: null,
  favourite: false,
  seasons: [],
  occasions: [],
  entries: [{ item: piece(`${id}-shirt`), slot: 'top', position: 0 }],
});

let mockOutfits: Outfit[] = [];
/** Outfit id to the path of its try-on render. */
let mockRenders: Record<string, string> = {};
jest.mock('@/outfits/useOutfits', () => ({
  useOutfits: () => ({ data: mockOutfits }),
  useRenderSummary:
    () =>
    (entry: Outfit): RenderSummary => ({
      current: mockRenders[entry.id]
        ? ({ imagePath: mockRenders[entry.id], thumbPath: mockRenders[entry.id] } as Render)
        : null,
      previous: null,
      pending: null,
      failed: null,
      outdated: false,
    }),
}));

/** The stored lookbook; the repository below changes it the way the real one does. */
let mockLookbook: Lookbook | null = null;
let mockDeleted = false;
const mockRepo = {
  rename: jest.fn(async (_id: string, name: string) => {
    mockLookbook = { ...mockLookbook!, name: name.trim() };
  }),
  moveOutfit: jest.fn(async (_id: string, outfitId: string, position: number) => {
    const rest = mockLookbook!.outfitIds.filter((entry) => entry !== outfitId);
    rest.splice(position, 0, outfitId);
    mockLookbook = { ...mockLookbook!, outfitIds: rest };
  }),
  setCover: jest.fn(async (_id: string, outfitId: string) => {
    mockLookbook = { ...mockLookbook!, coverOutfitId: outfitId };
  }),
  removeOutfit: jest.fn(async (_id: string, outfitId: string) => {
    const outfitIds = mockLookbook!.outfitIds.filter((entry) => entry !== outfitId);
    mockLookbook = {
      ...mockLookbook!,
      outfitIds,
      coverOutfitId:
        mockLookbook!.coverOutfitId === outfitId
          ? (outfitIds[0] ?? null)
          : mockLookbook!.coverOutfitId,
    };
  }),
  remove: jest.fn(async (_id: string) => {
    mockDeleted = true;
  }),
  restore: jest.fn(async (_id: string) => {
    mockDeleted = false;
  }),
};
jest.mock('../repository', () => ({
  lookbookRepository: {
    get: async (id: string) =>
      mockLookbook && mockLookbook.id === id && !mockDeleted ? { ...mockLookbook } : null,
    rename: (id: string, name: string) => mockRepo.rename(id, name),
    moveOutfit: (id: string, outfitId: string, position: number) =>
      mockRepo.moveOutfit(id, outfitId, position),
    setCover: (id: string, outfitId: string) => mockRepo.setCover(id, outfitId),
    removeOutfit: (id: string, outfitId: string) => mockRepo.removeOutfit(id, outfitId),
    remove: (id: string) => mockRepo.remove(id),
    restore: (id: string) => mockRepo.restore(id),
  },
}));

const lookbook = (outfitIds: string[], patch: Partial<Lookbook> = {}): Lookbook => ({
  id: 'lb-1',
  createdAt: 1,
  name: 'Summer',
  description: null,
  outfitIds,
  coverOutfitId: outfitIds[0] ?? null,
  ...patch,
});

const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
    >
      <LookbookScreen />
      <ToastHost />
    </QueryClientProvider>,
  );
/** Lets what a tap started finish: the repository call and the reading that follows it. */
const settle = () => act(() => jest.advanceTimersByTimeAsync(100));
/** Shows a long lookbook and waits for its grid, which draws the rows beyond the first ten later. */
const showLong = async () => {
  show();
  await act(() => jest.advanceTimersByTimeAsync(1000));
};
/** The outfits of the grid, in the order they are shown. */
const shownOrder = () =>
  screen
    .getAllByTestId(/^lookbook-outfit-/)
    .map((tile) => (tile.props.testID as string).replace('lookbook-outfit-', ''));
/** Answers the next confirmation with the button at `index`. */
const answerAlert = (index: number) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[index].onPress?.();
  });

beforeEach(() => {
  // A grid redraws on a timer after every change. With the timers in the test's hands that
  // happens while the test waits for something, and never after it has moved on.
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockParams = { id: 'lb-1' };
  mockOutfits = [outfit('a'), outfit('b'), outfit('c')];
  mockRenders = {};
  mockLookbook = lookbook(['a', 'b', 'c']);
  mockDeleted = false;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('lookbook screen', () => {
  it('says so when the lookbook no longer exists', async () => {
    mockParams = { id: 'gone' };
    show();
    expect(await screen.findByText('This lookbook no longer exists.')).toBeTruthy();
    expect(screen.getByText('Lookbook')).toBeTruthy();
    expect(screen.queryByTestId('lookbook-grid')).toBeNull();
    expect(screen.queryByTestId('lookbook-delete')).toBeNull();
  });

  it('shows the outfits in the order of the lookbook, not of the outfit list', async () => {
    mockLookbook = lookbook(['c', 'a', 'b']);
    show();
    expect(await screen.findByTestId('lookbook-name')).toHaveProp('value', 'Summer');
    expect(shownOrder()).toEqual(['c', 'a', 'b']);
    expect(screen.getByTestId('collage-piece-c-shirt')).toBeTruthy();
    expect(screen.queryByText('No outfits here yet')).toBeNull();
  });

  it('leaves out an outfit that is not among the outfits any more', async () => {
    mockLookbook = lookbook(['a', 'vanished', 'c']);
    show();
    await screen.findByTestId('lookbook-grid');
    expect(shownOrder()).toEqual(['a', 'c']);
  });

  it('names each outfit for screen readers and shows its try-on picture when there is one', async () => {
    mockOutfits = [outfit('a', 'Friday'), outfit('b', null), outfit('c')];
    mockRenders = { a: 'images/renders/a.png' };
    show();
    expect(await screen.findByLabelText('Friday')).toBe(screen.getByTestId('lookbook-outfit-a'));
    expect(screen.getByLabelText('Unnamed outfit')).toBe(screen.getByTestId('lookbook-outfit-b'));
    expect(screen.getAllByTestId('outfit-render')).toHaveLength(1);
    expect(screen.getByTestId('outfit-render').props.source).toEqual({
      uri: 'file:///documents/images/renders/a.png',
    });
    expect(screen.queryByTestId('collage-piece-a-shirt')).toBeNull();
    expect(screen.getByTestId('collage-piece-b-shirt')).toBeTruthy();
  });

  it('opens an outfit', async () => {
    show();
    fireEvent.press(await screen.findByTestId('lookbook-outfit-b'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/outfit/[id]', params: { id: 'b' } });
  });

  it('marks the cover outfit, and only that one', async () => {
    mockLookbook = lookbook(['a', 'b', 'c'], { coverOutfitId: 'b' });
    show();
    expect(await screen.findByTestId('lookbook-cover-b')).toHaveTextContent('Cover');
    expect(screen.queryByTestId('lookbook-cover-a')).toBeNull();
    expect(screen.queryByTestId('lookbook-cover-c')).toBeNull();
  });

  it('explains an empty lookbook and offers nothing to arrange or share', async () => {
    mockLookbook = lookbook([]);
    show();
    expect(await screen.findByText('No outfits here yet')).toBeTruthy();
    expect(screen.getByText(/choose Add to lookbook/)).toBeTruthy();
    expect(screen.queryByTestId('lookbook-arrange')).toBeNull();
    expect(screen.queryByTestId('lookbook-share')).toBeNull();
    // It can still be renamed and deleted.
    expect(screen.getByTestId('lookbook-name')).toHaveProp('value', 'Summer');
    expect(screen.getByTestId('lookbook-delete')).toHaveTextContent('Delete lookbook');
  });
});

describe('renaming a lookbook', () => {
  it('offers to save only a name that changed and is not empty', async () => {
    show();
    const name = await screen.findByTestId('lookbook-name');
    expect(screen.queryByTestId('lookbook-rename')).toBeNull();

    fireEvent.changeText(name, 'Summer 2031');
    expect(screen.getByTestId('lookbook-rename')).toHaveTextContent('Save');
    fireEvent.changeText(name, '');
    expect(screen.queryByTestId('lookbook-rename')).toBeNull();
    fireEvent.changeText(name, '   ');
    expect(screen.queryByTestId('lookbook-rename')).toBeNull();
    // Spaces around the same name are no change.
    fireEvent.changeText(name, '  Summer ');
    expect(screen.queryByTestId('lookbook-rename')).toBeNull();
    fireEvent.changeText(name, 'Summer');
    expect(screen.queryByTestId('lookbook-rename')).toBeNull();
    expect(mockRepo.rename).not.toHaveBeenCalled();
  });

  it('saves the new name and then has nothing left to save', async () => {
    show();
    fireEvent.changeText(await screen.findByTestId('lookbook-name'), 'Holiday');
    fireEvent.press(screen.getByTestId('lookbook-rename'));
    await waitFor(() => expect(mockRepo.rename).toHaveBeenCalledWith('lb-1', 'Holiday'));
    await settle();
    expect(mockRepo.rename).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('lookbook-name')).toHaveProp('value', 'Holiday');
    expect(screen.queryByTestId('lookbook-rename')).toBeNull();
    expect(shownOrder()).toEqual(['a', 'b', 'c']);

    // Going back to the old name is a change again.
    fireEvent.changeText(screen.getByTestId('lookbook-name'), 'Summer');
    expect(screen.getByTestId('lookbook-rename')).toBeTruthy();
  });
});

describe('arranging a lookbook', () => {
  const arrange = async () => {
    show();
    fireEvent.press(await screen.findByTestId('lookbook-arrange'));
  };

  it('shows the controls only while arranging', async () => {
    show();
    expect(await screen.findByTestId('lookbook-arrange')).toHaveTextContent('Arrange');
    expect(screen.queryByTestId('lookbook-earlier-a')).toBeNull();
    expect(screen.queryByTestId('lookbook-remove-a')).toBeNull();

    fireEvent.press(screen.getByTestId('lookbook-arrange'));
    expect(screen.getByTestId('lookbook-arrange')).toHaveTextContent('Done');
    for (const id of ['a', 'b', 'c']) {
      expect(screen.getByTestId(`lookbook-earlier-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`lookbook-later-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`lookbook-set-cover-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`lookbook-remove-${id}`)).toBeTruthy();
    }
    expect(screen.getAllByLabelText('Move earlier')).toHaveLength(3);
    expect(screen.getAllByLabelText('Move later')).toHaveLength(3);
    expect(screen.getAllByLabelText('Use as cover')).toHaveLength(3);
    expect(screen.getAllByLabelText('Remove from lookbook')).toHaveLength(3);

    fireEvent.press(screen.getByTestId('lookbook-arrange'));
    expect(screen.getByTestId('lookbook-arrange')).toHaveTextContent('Arrange');
    expect(screen.queryByTestId('lookbook-later-a')).toBeNull();
  });

  it('cannot move the first outfit earlier or the last one later', async () => {
    await arrange();
    expect(screen.getByTestId('lookbook-earlier-a')).toBeDisabled();
    expect(screen.getByTestId('lookbook-later-a')).not.toBeDisabled();
    expect(screen.getByTestId('lookbook-earlier-b')).not.toBeDisabled();
    expect(screen.getByTestId('lookbook-later-b')).not.toBeDisabled();
    expect(screen.getByTestId('lookbook-earlier-c')).not.toBeDisabled();
    expect(screen.getByTestId('lookbook-later-c')).toBeDisabled();

    fireEvent.press(screen.getByTestId('lookbook-earlier-a'));
    fireEvent.press(screen.getByTestId('lookbook-later-c'));
    await settle();
    expect(mockRepo.moveOutfit).not.toHaveBeenCalled();
    expect(shownOrder()).toEqual(['a', 'b', 'c']);
  });

  it('moves an outfit later and earlier, one place at a time', async () => {
    await arrange();
    fireEvent.press(screen.getByTestId('lookbook-later-a'));
    await waitFor(() => expect(shownOrder()).toEqual(['b', 'a', 'c']));
    expect(mockRepo.moveOutfit).toHaveBeenLastCalledWith('lb-1', 'a', 1);
    // The ends follow the new order.
    expect(screen.getByTestId('lookbook-earlier-b')).toBeDisabled();
    expect(screen.getByTestId('lookbook-earlier-a')).not.toBeDisabled();

    fireEvent.press(screen.getByTestId('lookbook-earlier-c'));
    await waitFor(() => expect(shownOrder()).toEqual(['b', 'c', 'a']));
    expect(mockRepo.moveOutfit).toHaveBeenLastCalledWith('lb-1', 'c', 1);
    expect(screen.getByTestId('lookbook-later-a')).toBeDisabled();
    expect(mockRepo.moveOutfit).toHaveBeenCalledTimes(2);
    // Arranging goes on until the user is done.
    expect(screen.getByTestId('lookbook-arrange')).toHaveTextContent('Done');
  });

  it('makes another outfit the cover', async () => {
    await arrange();
    expect(screen.getByTestId('lookbook-cover-a')).toBeTruthy();
    fireEvent.press(screen.getByTestId('lookbook-set-cover-c'));
    expect(await screen.findByTestId('lookbook-cover-c')).toHaveTextContent('Cover');
    expect(mockRepo.setCover).toHaveBeenCalledTimes(1);
    expect(mockRepo.setCover).toHaveBeenCalledWith('lb-1', 'c');
    expect(screen.queryByTestId('lookbook-cover-a')).toBeNull();
    expect(shownOrder()).toEqual(['a', 'b', 'c']);
  });

  it('takes an outfit out of the lookbook', async () => {
    await arrange();
    fireEvent.press(screen.getByTestId('lookbook-remove-b'));
    await waitFor(() => expect(shownOrder()).toEqual(['a', 'c']));
    expect(mockRepo.removeOutfit).toHaveBeenCalledTimes(1);
    expect(mockRepo.removeOutfit).toHaveBeenCalledWith('lb-1', 'b');
    // The lookbook itself is not deleted.
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('shows the empty state once the last outfit was taken out', async () => {
    mockLookbook = lookbook(['a']);
    await arrange();
    expect(screen.getByTestId('lookbook-earlier-a')).toBeDisabled();
    expect(screen.getByTestId('lookbook-later-a')).toBeDisabled();
    fireEvent.press(screen.getByTestId('lookbook-remove-a'));
    expect(await screen.findByText('No outfits here yet')).toBeTruthy();
    expect(mockRepo.removeOutfit).toHaveBeenCalledWith('lb-1', 'a');
    expect(screen.queryByTestId('lookbook-arrange')).toBeNull();
  });
});

describe('deleting a lookbook', () => {
  it('asks first and does nothing on cancel', async () => {
    const alert = answerAlert(0);
    show();
    fireEvent.press(await screen.findByTestId('lookbook-delete'));
    expect(alert).toHaveBeenCalledWith(
      'Delete this lookbook?',
      'The lookbook is removed. Its outfits stay in your Outfits.',
      [
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ],
    );
    await settle();
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.queryByText('Lookbook deleted')).toBeNull();
    expect(shownOrder()).toEqual(['a', 'b', 'c']);
  });

  it('deletes after confirmation, leaves the screen, and can be undone', async () => {
    answerAlert(1);
    show();
    fireEvent.press(await screen.findByTestId('lookbook-delete'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Lookbook deleted')).toBeTruthy();
    expect(mockRepo.remove).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).toHaveBeenCalledWith('lb-1');
    // Whoever still shows it reads it again and finds it gone.
    expect(await screen.findByText('This lookbook no longer exists.')).toBeTruthy();

    expect(screen.getByText('Undo')).toBeTruthy();
    fireEvent.press(screen.getByTestId('toast-action'));
    await waitFor(() => expect(mockRepo.restore).toHaveBeenCalledWith('lb-1'));
    expect(await screen.findByTestId('lookbook-outfit-a')).toBeTruthy();
    expect(screen.queryByText('Lookbook deleted')).toBeNull();
    expect(mockRepo.restore).toHaveBeenCalledTimes(1);
  });
});

describe('sharing a lookbook', () => {
  it('opens the share sheet with every outfit under the name of the lookbook', async () => {
    mockRenders = { b: 'images/renders/b.png' };
    show();
    expect(await screen.findByTestId('lookbook-share')).toHaveTextContent(/Share/);
    expect(screen.queryByTestId('share-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('lookbook-share'));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer');
    expect(
      screen.getAllByTestId(/^share-tile-/).map((tile) => tile.props.testID as string),
    ).toEqual(['share-tile-a', 'share-tile-b', 'share-tile-c']);
    // One outfit has a try-on picture, so it is used, and the pieces alone can be chosen instead.
    expect(screen.getAllByTestId('share-render')).toHaveLength(1);
    expect(screen.getByTestId('share-render').props.source).toEqual({
      uri: 'file:///documents/images/renders/b.png',
    });
    expect(screen.getAllByTestId('share-collage')).toHaveLength(2);
    fireEvent.press(screen.getByTestId('share-content-collage'));
    expect(screen.queryByTestId('share-render')).toBeNull();
    expect(screen.getAllByTestId('share-collage')).toHaveLength(3);
    // Nothing leaves the phone by opening the sheet.
    expect(mockShare).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('share-close'));
    expect(screen.queryByTestId('share-sheet')).toBeNull();
  });

  it('shares in the order of the lookbook and sends the image on request', async () => {
    mockLookbook = lookbook(['c', 'a']);
    show();
    fireEvent.press(await screen.findByTestId('lookbook-share'));
    expect(
      screen.getAllByTestId(/^share-tile-/).map((tile) => tile.props.testID as string),
    ).toEqual(['share-tile-c', 'share-tile-a']);
    expect(screen.queryByTestId('share-content-render')).toBeNull();

    fireEvent.press(screen.getByTestId('share-send'));
    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith('file:///tmp/card.png', expect.anything()),
    );
  });

  it('shares a single outfit as one picture', async () => {
    mockLookbook = lookbook(['b']);
    show();
    fireEvent.press(await screen.findByTestId('lookbook-share'));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer');
    expect(screen.queryByTestId(/^share-tile-/)).toBeNull();
    expect(screen.getByTestId('share-collage')).toBeTruthy();
  });

  it('splits a large lookbook into pages of twelve, shared one at a time', async () => {
    const ids = Array.from({ length: 26 }, (_, index) => `o${index + 1}`);
    mockOutfits = ids.map((id) => outfit(id));
    mockLookbook = lookbook(ids);
    await showLong();
    fireEvent.press(screen.getByTestId('lookbook-share'));

    const tiles = () =>
      screen
        .getAllByTestId(/^share-tile-/)
        .map((tile) => (tile.props.testID as string).replace('share-tile-', ''));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer (1/3)');
    expect(tiles()).toEqual(ids.slice(0, 12));

    // Close closes: the next page is not forced on the user.
    fireEvent.press(screen.getByTestId('share-close'));
    expect(screen.queryByTestId('share-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('lookbook-share-page-1'));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer (2/3)');
    expect(tiles()).toEqual(ids.slice(12, 24));
    fireEvent.press(screen.getByTestId('share-close'));

    fireEvent.press(screen.getByTestId('lookbook-share-page-2'));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer (3/3)');
    expect(tiles()).toEqual(['o25', 'o26']);

    fireEvent.press(screen.getByTestId('share-close'));
    expect(screen.queryByTestId('share-sheet')).toBeNull();

    // Sharing again starts from the first page.
    fireEvent.press(screen.getByTestId('lookbook-share'));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer (1/3)');
  });

  it('keeps twelve outfits on a single page without numbering it', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => `o${index + 1}`);
    mockOutfits = ids.map((id) => outfit(id));
    mockLookbook = lookbook(ids);
    await showLong();
    fireEvent.press(screen.getByTestId('lookbook-share'));
    expect(screen.getByTestId('share-card-title')).toHaveTextContent('Summer');
    expect(screen.getByTestId('share-card-title')).not.toHaveTextContent(/\//);
    expect(screen.getAllByTestId(/^share-tile-/)).toHaveLength(12);
    // One page needs no page choice.
    expect(screen.queryByTestId('lookbook-share-page-0')).toBeNull();
    fireEvent.press(screen.getByTestId('share-close'));
    expect(screen.queryByTestId('share-sheet')).toBeNull();
  });
});
