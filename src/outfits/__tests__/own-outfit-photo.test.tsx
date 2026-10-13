import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useToast } from '@/shell/toast';

import { OwnOutfitPhoto } from '../OwnOutfitPhoto';
import type { Outfit } from '../repository';

const mockPick = jest.fn();
jest.mock('@/profile/photo', () => ({ pickPhoto: (...args: unknown[]) => mockPick(...args) }));

const mockSave = jest.fn(async (..._args: unknown[]) => {});
jest.mock('../renderActions', () => ({
  saveManualRender: (...args: unknown[]) => mockSave(...args),
}));

const outfit = { id: 'o1', entries: [] } as unknown as Outfit;
const photo = { uri: 'file:///picked/look.jpg', width: 900, height: 1200 };
const onAdded = jest.fn();
const open = () => render(<OwnOutfitPhoto outfit={outfit} onAdded={onAdded} />);

beforeEach(() => {
  jest.clearAllMocks();
  useToast.setState({ toast: null } as never);
});

describe('the user’s own photo of an outfit', () => {
  it.each([
    ['outfit-photo-camera', 'camera'],
    ['outfit-photo-library', 'library'],
  ])('is taken from %s and stored as the outfit picture', async (button, source) => {
    mockPick.mockResolvedValue({ status: 'picked', photo });
    open();
    fireEvent.press(screen.getByTestId(button));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith(outfit, photo, 'photo'));
    expect(mockPick).toHaveBeenCalledWith(source);
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(useToast.getState().toast).toMatchObject({
      message: 'Your photo is now shown for this outfit.',
    });
  });

  it('stores nothing when the picker is cancelled', async () => {
    mockPick.mockResolvedValue({ status: 'cancelled' });
    open();
    fireEvent.press(screen.getByTestId('outfit-photo-library'));

    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(mockSave).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(screen.queryByTestId('outfit-photo-denied')).toBeNull();
  });

  it('explains how to allow the camera when access is denied', async () => {
    mockPick.mockResolvedValue({ status: 'denied' });
    open();
    fireEvent.press(screen.getByTestId('outfit-photo-camera'));

    expect(await screen.findByTestId('outfit-photo-denied')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('says something went wrong when the photo cannot be stored', async () => {
    mockPick.mockResolvedValue({ status: 'picked', photo });
    mockSave.mockRejectedValueOnce(new Error('disk full'));
    open();
    fireEvent.press(screen.getByTestId('outfit-photo-library'));

    await waitFor(() =>
      expect(useToast.getState().toast).toMatchObject({
        message: 'Something went wrong. Please try again.',
      }),
    );
    expect(onAdded).not.toHaveBeenCalled();
    // The buttons work again for another try.
    expect(screen.getByTestId('outfit-photo-library')).not.toBeDisabled();
  });

  it('picks only once when tapped twice in a row', async () => {
    let finish: (value: unknown) => void = () => {};
    mockPick.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    fireEvent.press(screen.getByTestId('outfit-photo-library'));
    fireEvent.press(screen.getByTestId('outfit-photo-camera'));
    finish({ status: 'picked', photo });

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockPick).toHaveBeenCalledTimes(1);
  });
});
