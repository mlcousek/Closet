import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Item } from '@/closet/types';
import { Button } from '@/components/ui';
import type { Profile } from '@/profile/types';
import { useToast } from '@/shell/toast';

import { ManualTryOn } from '../ManualTryOn';
import type { Outfit } from '../repository';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const mockClipboard = jest.fn(async (_text: string) => true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockClipboard(text) }));

const mockCapture = jest.fn(async (..._args: unknown[]) => 'file:///cache/sheet.jpg');
jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCapture(...args),
}));

const mockShare = jest.fn(async (..._args: unknown[]) => {});
jest.mock('@/sharing/share', () => ({ shareImage: (...args: unknown[]) => mockShare(...args) }));

const mockPick = jest.fn();
const mockPickSeveral = jest.fn();
jest.mock('@/profile/photo', () => ({
  pickPhoto: (...args: unknown[]) => mockPick(...args),
  pickPhotos: (...args: unknown[]) => mockPickSeveral(...args),
}));

let mockProfile: Partial<Profile> | null = null;
jest.mock('@/profile/useProfile', () => ({ useProfile: () => ({ data: mockProfile }) }));

const mockSave = jest.fn(async (..._args: unknown[]) => {});
jest.mock('../renderActions', () => ({
  SLOT_LABEL: { top: 'top', bottom: 'bottom' },
  describeItem: (item: { name: string }) => item.name,
  avatarBasePath: (profile: Partial<Profile> | null) => profile?.avatarSmallPath ?? null,
  saveManualRender: (...args: unknown[]) => mockSave(...args),
}));

const piece = (id: string, cutoutPath: string | null = null) =>
  ({
    id,
    name: id,
    originalPath: `images/items/${id}.jpg`,
    cutoutPath,
    thumbPath: `images/items/${id}-t.jpg`,
  }) as Item;
const outfit = {
  id: 'o1',
  entries: [
    { item: piece('shirt', 'images/items/shirt.png'), slot: 'top', position: 0 },
    { item: piece('skirt'), slot: 'bottom', position: 0 },
  ],
} as Outfit;

const onClose = jest.fn();
const open = () => render(<ManualTryOn outfits={[outfit]} onClose={onClose} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { avatarSmallPath: 'images/avatar/me.jpg' };
  useToast.setState({ toast: null } as never);
});

describe('try-on in another app', () => {
  it('puts the photo and every piece, at full quality, on the sheet', () => {
    open();
    expect(screen.getByTestId('manual-sheet-photo').props.source).toEqual({
      uri: 'file:///documents/images/avatar/me.jpg',
    });
    expect(screen.getByTestId('manual-sheet-piece-shirt')).toBeTruthy();
    expect(screen.getByTestId('manual-sheet-piece-skirt')).toBeTruthy();
    expect(screen.queryByTestId('manual-no-photo')).toBeNull();
  });

  it('copies the request, then shares the sheet as one picture', async () => {
    open();
    fireEvent.press(screen.getByTestId('manual-share'));

    await waitFor(() =>
      expect(mockShare).toHaveBeenCalledWith('file:///cache/sheet.jpg', 'image/jpeg'),
    );
    const text = mockClipboard.mock.calls[0][0];
    expect(text).toContain('On the left is a photo of me');
    expect(text).toContain('1. top: shirt');
    expect(text).toContain('2. bottom: skirt');
    expect(mockCapture.mock.calls[0][1]).toMatchObject({ format: 'jpg', result: 'tmpfile' });
    expect(await screen.findByTestId('manual-notice')).toHaveTextContent(/copied/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('says so when there is no photo of the user, and asks for it in the request', async () => {
    mockProfile = null;
    open();
    expect(screen.queryByTestId('manual-sheet-photo')).toBeNull();
    expect(screen.getByTestId('manual-no-photo')).toBeTruthy();

    fireEvent.press(screen.getByTestId('manual-share'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    expect(mockClipboard.mock.calls[0][0]).toContain('I am also attaching a full-body photo of me');
  });

  it('adds the picked picture to the outfit and closes', async () => {
    const photo = { uri: 'file:///picked/result.png', width: 900, height: 1200 };
    mockPick.mockResolvedValue({ status: 'picked', photo });
    open();
    fireEvent.press(screen.getByTestId('manual-add'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockPick).toHaveBeenCalledWith('library');
    expect(mockSave).toHaveBeenCalledWith(outfit, photo);
    expect(useToast.getState().toast?.message).toMatch(/shown for this outfit/);
  });

  it('stays open and adds nothing when picking is cancelled', async () => {
    mockPick.mockResolvedValue({ status: 'cancelled' });
    open();
    fireEvent.press(screen.getByTestId('manual-add'));

    await waitFor(() => expect(screen.getByTestId('manual-add')).toBeEnabled());
    expect(mockSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a picture that could not be stored and stays open', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: { uri: 'x', width: 1, height: 1 } });
    mockSave.mockRejectedValueOnce(new Error('disk full'));
    open();
    fireEvent.press(screen.getByTestId('manual-add'));

    expect(await screen.findByTestId('manual-notice')).toHaveTextContent(/went wrong/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a failed share', async () => {
    mockCapture.mockRejectedValueOnce(new Error('no view'));
    open();
    fireEvent.press(screen.getByTestId('manual-share'));

    expect(await screen.findByTestId('manual-notice')).toHaveTextContent(/went wrong/i);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('closes on request', () => {
    open();
    fireEvent.press(screen.getByTestId('manual-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('a run through several outfits', () => {
  const second = {
    ...outfit,
    id: 'o2',
    name: 'Friday',
    entries: outfit.entries.slice(1),
  } as Outfit;
  const third = { ...outfit, id: 'o3', entries: outfit.entries.slice(0, 1) } as Outfit;
  const photo = (name: string) => ({ uri: `file:///picked/${name}.png`, width: 900, height: 1200 });
  const openRun = () => render(<ManualTryOn outfits={[outfit, second, third]} onClose={onClose} />);

  it('shows where it is and offers no run controls for a single outfit', () => {
    open();
    expect(screen.queryByTestId('manual-progress')).toBeNull();
    expect(screen.queryByTestId('manual-next')).toBeNull();
    expect(screen.queryByTestId('manual-add-all')).toBeNull();
  });

  it('steps through the outfits, sharing the sheet and request of the one shown', async () => {
    openRun();
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 1 of 3');
    fireEvent.press(screen.getByTestId('manual-next'));
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 2 of 3 · Friday');
    expect(screen.queryByTestId('manual-sheet-piece-shirt')).toBeNull();

    fireEvent.press(screen.getByTestId('manual-share'));
    await waitFor(() => expect(mockShare).toHaveBeenCalled());
    expect(mockClipboard.mock.calls[0][0]).toContain('1. bottom: skirt');
    expect(mockClipboard.mock.calls[0][0]).not.toContain('shirt');

    fireEvent.press(screen.getByTestId('manual-next'));
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 3 of 3');
    // After the last one it starts again from the first.
    fireEvent.press(screen.getByTestId('manual-next'));
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 1 of 3');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves on to an outfit that still waits, and closes only when every outfit has a picture', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: photo('a') });
    openRun();
    expect(screen.queryByTestId('manual-added')).toBeNull();
    fireEvent.press(screen.getByTestId('manual-add'));
    await waitFor(() =>
      expect(screen.getByTestId('manual-progress')).toHaveTextContent(/Outfit 2 of 3/),
    );
    expect(mockSave).toHaveBeenLastCalledWith(outfit, photo('a'));
    expect(screen.getByTestId('manual-added')).toHaveTextContent('Pictures added: 1');
    expect(onClose).not.toHaveBeenCalled();

    // The second one is skipped for now; the third gets its picture first.
    await waitFor(() => expect(screen.getByTestId('manual-next')).toBeEnabled());
    fireEvent.press(screen.getByTestId('manual-next'));
    fireEvent.press(screen.getByTestId('manual-add'));
    // Nothing waits after the last outfit, so it goes back to the one that was skipped.
    await waitFor(() =>
      expect(screen.getByTestId('manual-progress')).toHaveTextContent(/Outfit 2 of 3/),
    );
    expect(mockSave).toHaveBeenLastCalledWith(third, photo('a'));
    expect(screen.getByTestId('manual-added')).toHaveTextContent('Pictures added: 2');
    expect(onClose).not.toHaveBeenCalled();
    expect(useToast.getState().toast).toBeNull();

    await waitFor(() => expect(screen.getByTestId('manual-add')).toBeEnabled());
    fireEvent.press(screen.getByTestId('manual-add'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockSave).toHaveBeenLastCalledWith(second, photo('a'));
    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(useToast.getState().toast?.message).toBe('Pictures added: 3');
  });

  it('marks an outfit that already has its picture when stepping back to it', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: photo('a') });
    openRun();
    expect(screen.getByTestId('manual-progress')).not.toHaveTextContent(/✓/);
    fireEvent.press(screen.getByTestId('manual-add'));
    await waitFor(() =>
      expect(screen.getByTestId('manual-progress')).toHaveTextContent(/Outfit 2 of 3/),
    );
    expect(screen.getByTestId('manual-progress')).not.toHaveTextContent(/✓/);

    await waitFor(() => expect(screen.getByTestId('manual-next')).toBeEnabled());
    fireEvent.press(screen.getByTestId('manual-next'));
    fireEvent.press(screen.getByTestId('manual-next'));
    expect(screen.getByTestId('manual-progress')).toHaveTextContent(/Outfit 1 of 3.*✓/);
  });

  it('adds pictures for all outfits at once, in the order they were picked', async () => {
    mockPickSeveral.mockResolvedValue([photo('a'), photo('b'), photo('c')]);
    openRun();
    fireEvent.press(screen.getByTestId('manual-next'));
    fireEvent.press(screen.getByTestId('manual-add-all'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockPickSeveral).toHaveBeenCalledWith(3);
    expect(mockSave.mock.calls).toEqual([
      [outfit, photo('a')],
      [second, photo('b')],
      [third, photo('c')],
    ]);
    expect(useToast.getState().toast?.message).toBe('Pictures added: 3');
  });

  it('stays open with a count when fewer pictures are picked than outfits wait', async () => {
    mockPickSeveral.mockResolvedValue([photo('a'), photo('b')]);
    openRun();
    fireEvent.press(screen.getByTestId('manual-add-all'));
    expect(await screen.findByTestId('manual-added')).toHaveTextContent('Pictures added: 2');
    expect(mockSave.mock.calls).toEqual([
      [outfit, photo('a')],
      [second, photo('b')],
    ]);
    // It shows the one outfit that still has no picture.
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 3 of 3');
    expect(screen.queryByTestId('manual-notice')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(useToast.getState().toast).toBeNull();
  });

  it('ignores pictures picked beyond the number of waiting outfits', async () => {
    mockPickSeveral.mockResolvedValue([photo('a'), photo('b'), photo('c'), photo('d')]);
    openRun();
    fireEvent.press(screen.getByTestId('manual-add-all'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls.map(([target]) => (target as Outfit).id)).toEqual([
      'o1',
      'o2',
      'o3',
    ]);
    expect(useToast.getState().toast?.message).toBe('Pictures added: 3');
  });

  it('gives the pictures of "add all" to the outfits that were not added one by one', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: photo('single') });
    mockPickSeveral.mockResolvedValue([photo('a'), photo('b')]);
    openRun();
    fireEvent.press(screen.getByTestId('manual-add'));
    await waitFor(() =>
      expect(screen.getByTestId('manual-progress')).toHaveTextContent(/Outfit 2 of 3/),
    );
    await waitFor(() => expect(screen.getByTestId('manual-add-all')).toBeEnabled());

    fireEvent.press(screen.getByTestId('manual-add-all'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // Only as many as still wait may be picked, and the first outfit gets no second picture.
    expect(mockPickSeveral).toHaveBeenCalledWith(2);
    expect(mockSave.mock.calls).toEqual([
      [outfit, photo('single')],
      [second, photo('a')],
      [third, photo('b')],
    ]);
    expect(useToast.getState().toast?.message).toBe('Pictures added: 3');
  });

  it('says on "add all" how many outfits still wait', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo: photo('a') });
    openRun();
    expect(screen.getByTestId('manual-add-all')).toHaveTextContent(
      /Add pictures for the remaining 3 at once/,
    );
    fireEvent.press(screen.getByTestId('manual-add'));
    await waitFor(() =>
      expect(screen.getByTestId('manual-add-all')).toHaveTextContent(
        /Add pictures for the remaining 2 at once/,
      ),
    );
  });

  it('keeps what was stored before a failure, so trying again continues with the rest', async () => {
    mockPickSeveral.mockResolvedValueOnce([photo('a'), photo('b'), photo('c')]);
    mockSave.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    openRun();
    fireEvent.press(screen.getByTestId('manual-add-all'));

    expect(await screen.findByTestId('manual-notice')).toHaveTextContent(/went wrong/i);
    expect(screen.getByTestId('manual-added')).toHaveTextContent('Pictures added: 1');
    expect(screen.getByTestId('manual-add-all')).toHaveTextContent(
      /Add pictures for the remaining 2 at once/,
    );
    // The third picture is not tried after the second one failed.
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();

    mockPickSeveral.mockResolvedValueOnce([photo('b'), photo('c')]);
    await waitFor(() => expect(screen.getByTestId('manual-add-all')).toBeEnabled());
    fireEvent.press(screen.getByTestId('manual-add-all'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockPickSeveral).toHaveBeenLastCalledWith(2);
    // The first outfit, whose picture was stored, is not given another one.
    expect(mockSave.mock.calls).toEqual([
      [outfit, photo('a')],
      [second, photo('b')],
      [second, photo('b')],
      [third, photo('c')],
    ]);
    expect(useToast.getState().toast?.message).toBe('Pictures added: 3');
  });

  it('stays open when nothing is picked', async () => {
    mockPickSeveral.mockResolvedValue([]);
    openRun();
    fireEvent.press(screen.getByTestId('manual-add-all'));
    await waitFor(() => expect(mockPickSeveral).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.getByTestId('manual-add-all')).toBeEnabled());
    expect(mockSave).not.toHaveBeenCalled();
    expect(screen.queryByTestId('manual-added')).toBeNull();
    expect(screen.queryByTestId('manual-notice')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when the very first picture cannot be stored', async () => {
    mockPickSeveral.mockResolvedValue([photo('a'), photo('b')]);
    mockSave.mockRejectedValueOnce(new Error('disk full'));
    openRun();
    fireEvent.press(screen.getByTestId('manual-add-all'));
    expect(await screen.findByTestId('manual-notice')).toHaveTextContent(/went wrong/i);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('manual-added')).toBeNull();
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 1 of 3');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('while a picture is being added', () => {
  const second = { ...outfit, id: 'o2' } as Outfit;
  const picked = { uri: 'file:///picked/a.png', width: 900, height: 1200 };

  /** A promise that stays open until the test settles it. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((yes) => {
      resolve = yes;
    });
    return { promise, resolve };
  }

  /** The handler of a button, to call it twice before anything is drawn again. */
  const handlerOf = (testID: string) =>
    screen.UNSAFE_getAllByType(Button).find((button) => button.props.testID === testID)!.props
      .onPress as () => void;

  it('disables every button, Close included, until the picture is stored', async () => {
    const storing = deferred<void>();
    mockPick.mockResolvedValue({ status: 'picked', photo: picked });
    mockSave.mockReturnValueOnce(storing.promise);
    render(<ManualTryOn outfits={[outfit, second]} onClose={onClose} />);
    expect(screen.getByTestId('manual-close')).toBeEnabled();

    fireEvent.press(screen.getByTestId('manual-add'));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    for (const id of ['share', 'add', 'next', 'add-all', 'close']) {
      expect(screen.getByTestId(`manual-${id}`)).toBeDisabled();
    }
    fireEvent.press(screen.getByTestId('manual-close'));
    fireEvent.press(screen.getByTestId('manual-next'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 1 of 2');

    await act(async () => storing.resolve());
    await waitFor(() => expect(screen.getByTestId('manual-close')).toBeEnabled());
    expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 2 of 2');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('manual-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap that arrives before the buttons are disabled', async () => {
    const picking = deferred<{ status: 'picked'; photo: typeof picked }>();
    mockPick.mockReturnValue(picking.promise);
    render(<ManualTryOn outfits={[outfit, second]} onClose={onClose} />);

    const add = handlerOf('manual-add');
    const addAll = handlerOf('manual-add-all');
    act(() => {
      add();
      add();
      addAll();
    });
    await act(async () => picking.resolve({ status: 'picked', photo: picked }));
    await waitFor(() =>
      expect(screen.getByTestId('manual-progress')).toHaveTextContent('Outfit 2 of 2'),
    );
    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(mockPickSeveral).not.toHaveBeenCalled();
    expect(mockSave.mock.calls).toEqual([[outfit, picked]]);
  });
});
