import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import TabsLayout from '@/app/(tabs)/_layout';

import { AvatarPicker } from '../AvatarPicker';
import { storeAvatarAnd, type AvatarDeps } from '../avatar';

jest.mock('expo-router', () => {
  const { Text, View } = require('react-native');
  const Tabs = ({ children }: { children: unknown }) => (
    <View testID="tabs">{children as never}</View>
  );
  Tabs.Screen = () => null;
  return {
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    Tabs,
  };
});
jest.mock('@/closet/ImportIndicator', () => ({ ImportIndicator: () => null }));
jest.mock('@/closet/useClosetSetup', () => ({ useClosetSetup: () => {} }));
jest.mock('@/display/useAutoStart', () => ({ useDisplayAutoStart: () => {} }));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});

const mockGet = jest.fn();
jest.mock('../repository', () => ({ profileRepository: { get: () => mockGet() } }));

const mockPickPhoto = jest.fn();
const mockCheckPhoto = jest.fn();
jest.mock('../photo', () => ({
  pickPhoto: (source: string) => mockPickPhoto(source),
  checkAvatarPhoto: (uri: string) => mockCheckPhoto(uri),
}));

describe('onboarding gate when the profile cannot be read', () => {
  it('shows an error with retry instead of sending the user to onboarding', async () => {
    mockGet.mockRejectedValueOnce(new Error('disk error')).mockResolvedValue({ name: 'Auri' });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <TabsLayout />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Your profile could not be loaded')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();

    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByTestId('tabs')).toBeTruthy();
  });
});

describe('avatar picker with a questionable photo', () => {
  const first = { uri: 'file:///tmp/first.jpg', width: 3000, height: 4000 };
  const second = { uri: 'file:///tmp/second.jpg', width: 3000, height: 4000 };

  it('goes back to the accepted photo when the new one is discarded', async () => {
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo: second });
    mockCheckPhoto.mockResolvedValue('cutOff');
    const onAccept = jest.fn();
    const onPendingChange = jest.fn();
    render(
      <AvatarPicker currentUri={first.uri} onAccept={onAccept} onPendingChange={onPendingChange} />,
    );

    fireEvent.press(screen.getByTestId('avatar-camera'));
    expect(await screen.findByTestId('avatar-warning')).toBeTruthy();
    expect(screen.getByTestId('avatar-preview').props.source).toEqual({ uri: second.uri });
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    fireEvent.press(screen.getByTestId('avatar-discard'));

    expect(screen.queryByTestId('avatar-warning')).toBeNull();
    expect(screen.getByTestId('avatar-preview').props.source).toEqual({ uri: first.uri });
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('does not ask for photo library permission before opening the picker', async () => {
    mockPickPhoto.mockResolvedValue({ status: 'cancelled' });
    render(<AvatarPicker currentUri={null} onAccept={jest.fn()} />);
    fireEvent.press(screen.getByTestId('avatar-library'));
    // Let the cancelled pick settle before asserting.
    await act(async () => {});
    expect(mockPickPhoto).toHaveBeenCalledWith('library');
    expect(screen.queryByTestId('avatar-denied')).toBeNull();
  });
});

describe('storing an avatar together with the profile', () => {
  const makeDeps = () => {
    const removed: string[] = [];
    let count = 0;
    const deps: AvatarDeps = {
      save: async () => `images/avatar/${count++}.jpg`,
      remove: async (path) => void removed.push(path),
      resize: async () => 'file:///tmp/small.jpg',
    };
    return { deps, removed };
  };
  const photo = { uri: 'file:///tmp/full.jpg', width: 3000, height: 4000 };

  it('keeps the files when the profile is saved', async () => {
    const { deps, removed } = makeDeps();
    const persist = jest.fn(async () => 'saved');
    await expect(storeAvatarAnd(photo, deps, persist)).resolves.toBe('saved');
    expect(persist).toHaveBeenCalledWith(
      { avatarPath: 'images/avatar/0.jpg', avatarSmallPath: 'images/avatar/1.jpg' },
      { isolated: false },
    );
    expect(removed).toEqual([]);
  });

  it('deletes the new files when saving the profile fails', async () => {
    const { deps, removed } = makeDeps();
    await expect(
      storeAvatarAnd(photo, deps, async () => {
        throw new Error('database is busy');
      }),
    ).rejects.toThrow('database is busy');
    expect(removed).toEqual(['images/avatar/0.jpg', 'images/avatar/1.jpg']);
  });
});
