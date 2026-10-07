import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { Item } from '@/closet/types';
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
jest.mock('@/profile/photo', () => ({ pickPhoto: (...args: unknown[]) => mockPick(...args) }));

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
const open = () => render(<ManualTryOn outfit={outfit} onClose={onClose} />);

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
