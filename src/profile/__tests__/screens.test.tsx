import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import TabsLayout from '@/app/(tabs)/_layout';
import HomeScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import OnboardingScreen from '@/app/onboarding';
import EditProfileScreen from '@/app/profile/edit';

import type { Profile } from '../types';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  const { Text, View } = require('react-native');
  const Tabs = ({ children }: { children: unknown }) => (
    <View testID="tabs">{children as never}</View>
  );
  Tabs.Screen = () => null;
  return {
    useRouter: () => mockRouter,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    Tabs,
  };
});

jest.mock('@/closet/ImportIndicator', () => ({ ImportIndicator: () => null }));
jest.mock('@/outfits/StudioAvatar', () => ({ StudioAvatar: () => null }));
jest.mock('@/closet/useClosetSetup', () => ({ useClosetSetup: () => {} }));
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'CZ' }],
}));

let mockProfile: Profile | null = null;
const mockSave = jest.fn(async (input: Partial<Profile>) => {
  mockProfile = {
    id: 'p1',
    name: '',
    gender: null,
    bodyType: null,
    heightCm: null,
    sizeTop: null,
    sizeBottom: null,
    sizeShoes: null,
    avatarPath: null,
    avatarSmallPath: null,
    avatarStudioPath: null,
    ...mockProfile,
    ...input,
  };
  return mockProfile;
});
jest.mock('../repository', () => ({
  profileRepository: { get: async () => mockProfile, save: (input: object) => mockSave(input) },
}));

const mockPickPhoto = jest.fn();
const mockCheckPhoto = jest.fn();
const mockRemoved: string[] = [];
jest.mock('../photo', () => ({
  pickPhoto: (source: string) => mockPickPhoto(source),
  checkAvatarPhoto: (uri: string) => mockCheckPhoto(uri),
  avatarDeps: {
    save: jest.fn(async (uri: string) => `images/avatar/${uri.split('/').pop()}`),
    remove: jest.fn(async (path: string) => void mockRemoved.push(path)),
    resize: jest.fn(async () => 'file:///tmp/small.jpg'),
  },
}));
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const photo = { uri: 'file:///tmp/full.jpg', width: 3000, height: 4000 };

const renderWithQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const fullProfile: Profile = {
  id: 'p1',
  name: 'Auri',
  gender: 'woman',
  bodyType: 'average',
  heightCm: 168,
  sizeTop: 'S',
  sizeBottom: null,
  sizeShoes: '38',
  avatarPath: 'images/avatar/old.jpg',
  avatarSmallPath: 'images/avatar/old-small.jpg',
  avatarStudioPath: null,
};

beforeEach(() => {
  mockProfile = null;
  mockRemoved.length = 0;
  jest.clearAllMocks();
  mockCheckPhoto.mockResolvedValue(null);
});

describe('onboarding gate', () => {
  it('sends a new user to onboarding instead of the main sections', async () => {
    renderWithQuery(<TabsLayout />);
    expect(await screen.findByTestId('redirect')).toHaveTextContent('/onboarding');
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('shows the main sections once a profile exists', async () => {
    mockProfile = fullProfile;
    renderWithQuery(<TabsLayout />);
    expect(await screen.findByTestId('tabs')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});

describe('onboarding flow', () => {
  const start = async () => {
    renderWithQuery(<OnboardingScreen />);
    fireEvent.press(await screen.findByTestId('onboarding-next'));
  };

  it('requires a name to continue', async () => {
    await start();
    expect(screen.getByTestId('onboarding-next')).toBeDisabled();
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    fireEvent.changeText(screen.getByTestId('onboarding-name'), '   ');
    expect(screen.getByTestId('onboarding-next')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('onboarding-name'), 'Auri');
    expect(screen.getByTestId('onboarding-next')).toBeEnabled();
  });

  it('offers three gender options and shows matching silhouettes', async () => {
    await start();
    fireEvent.changeText(screen.getByTestId('onboarding-name'), 'Auri');
    fireEvent.press(screen.getByTestId('onboarding-next'));

    expect(screen.getByText('Woman')).toBeTruthy();
    expect(screen.getByText('Man')).toBeTruthy();
    expect(screen.getByText('Prefer not to say')).toBeTruthy();
    fireEvent.press(screen.getByTestId('gender-man'));
    fireEvent.press(screen.getByTestId('onboarding-next'));

    expect(screen.getByTestId('body-types-man')).toBeTruthy();
    fireEvent.press(screen.getByTestId('body-type-athletic'));
    expect(screen.getByTestId('body-type-athletic')).toBeSelected();
  });

  it.each(['woman', 'man', 'unspecified'] as const)(
    'shows the body type set for %s',
    async (gender) => {
      await start();
      fireEvent.changeText(screen.getByTestId('onboarding-name'), 'Auri');
      fireEvent.press(screen.getByTestId('onboarding-next'));
      fireEvent.press(screen.getByTestId(`gender-${gender}`));
      fireEvent.press(screen.getByTestId('onboarding-next'));
      expect(screen.getByTestId(`body-types-${gender}`)).toBeTruthy();
      expect(screen.getAllByRole('radio')).toHaveLength(5);
    },
  );

  it('saves the profile with skipped steps left unset and opens Home', async () => {
    await start();
    fireEvent.changeText(screen.getByTestId('onboarding-name'), ' Auri ');
    fireEvent.press(screen.getByTestId('onboarding-next'));
    fireEvent.press(screen.getByTestId('gender-woman'));
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(screen.getByText('Add a full-body photo')).toBeTruthy();
    expect(screen.getByTestId('onboarding-next')).toBeDisabled();
    fireEvent.press(screen.getByTestId('onboarding-skip'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockSave).toHaveBeenCalledWith({ name: 'Auri', gender: null, bodyType: null });
  });

  it('stores the avatar photo when one is taken', async () => {
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    await start();
    fireEvent.changeText(screen.getByTestId('onboarding-name'), 'Auri');
    fireEvent.press(screen.getByTestId('onboarding-next'));
    fireEvent.press(screen.getByTestId('gender-woman'));
    fireEvent.press(screen.getByTestId('onboarding-next'));
    fireEvent.press(screen.getByTestId('body-type-curvy'));
    fireEvent.press(screen.getByTestId('onboarding-next'));

    expect(screen.getByText(/Stand straight facing the camera/)).toBeTruthy();
    expect(screen.getByText('Whole body')).toBeTruthy();
    fireEvent.press(screen.getByTestId('avatar-camera'));
    expect(await screen.findByTestId('avatar-preview')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-next'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockSave).toHaveBeenCalledWith({
      name: 'Auri',
      gender: 'woman',
      bodyType: 'curvy',
      avatarPath: 'images/avatar/full.jpg',
      avatarSmallPath: 'images/avatar/small.jpg',
    });
  });

  const toAvatarStep = async () => {
    await start();
    fireEvent.changeText(screen.getByTestId('onboarding-name'), 'Auri');
    fireEvent.press(screen.getByTestId('onboarding-next'));
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    fireEvent.press(screen.getByTestId('onboarding-skip'));
  };

  it('warns about an unsuitable photo and lets the user keep it', async () => {
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    mockCheckPhoto.mockResolvedValue('severalPeople');
    await toAvatarStep();

    fireEvent.press(screen.getByTestId('avatar-library'));
    expect(await screen.findByTestId('avatar-warning')).toHaveTextContent(/more than one person/);
    expect(screen.getByTestId('onboarding-next')).toBeDisabled();

    fireEvent.press(screen.getByTestId('avatar-keep'));
    expect(screen.queryByTestId('avatar-warning')).toBeNull();
    expect(screen.getByTestId('onboarding-next')).toBeEnabled();
  });

  it('explains denied access with a shortcut to system settings', async () => {
    mockPickPhoto.mockResolvedValue({ status: 'denied' });
    await toAvatarStep();
    fireEvent.press(screen.getByTestId('avatar-camera'));
    expect(await screen.findByTestId('avatar-denied')).toHaveTextContent(/no access/);
    expect(screen.getByText('Open system settings')).toBeTruthy();
  });
});

describe('profile section', () => {
  it('shows the profile values', async () => {
    mockProfile = fullProfile;
    renderWithQuery(<ProfileScreen />);
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Auri');
    expect(screen.getByText('Woman')).toBeTruthy();
    expect(screen.getByText('Average')).toBeTruthy();
    expect(screen.getByText('168 cm')).toBeTruthy();
    expect(screen.getByText('38')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
    expect(screen.getByTestId('profile-avatar')).toBeTruthy();
  });

  it('shows a placeholder without an avatar', async () => {
    mockProfile = { ...fullProfile, avatarPath: null, avatarSmallPath: null };
    renderWithQuery(<ProfileScreen />);
    expect(await screen.findByTestId('profile-no-avatar')).toBeTruthy();
  });

  it('greets the user by name on Home', async () => {
    mockProfile = fullProfile;
    renderWithQuery(<HomeScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('greeting')).toHaveTextContent(/^Good \w+, Auri$/),
    );
  });
});

describe('profile editing', () => {
  it('saves changed values', async () => {
    mockProfile = fullProfile;
    renderWithQuery(<EditProfileScreen />);
    fireEvent.changeText(await screen.findByTestId('edit-name'), 'Aurianna');
    fireEvent.press(screen.getByTestId('gender-unspecified'));
    fireEvent.press(screen.getByTestId('body-type-plus'));
    fireEvent.changeText(screen.getByTestId('edit-height'), '172');
    fireEvent.changeText(screen.getByTestId('edit-size-top'), '');
    fireEvent.changeText(screen.getByTestId('edit-size-bottom'), '28');
    fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockSave).toHaveBeenCalledWith({
      name: 'Aurianna',
      gender: 'unspecified',
      bodyType: 'plus',
      heightCm: 172,
      sizeTop: null,
      sizeBottom: '28',
      sizeShoes: '38',
    });
  });

  it('does not save without a name or with an implausible height', async () => {
    mockProfile = fullProfile;
    renderWithQuery(<EditProfileScreen />);
    fireEvent.changeText(await screen.findByTestId('edit-name'), ' ');
    fireEvent.press(screen.getByTestId('edit-save'));
    expect(screen.getByTestId('edit-error')).toHaveTextContent('Enter a name to continue.');

    fireEvent.changeText(screen.getByTestId('edit-name'), 'Auri');
    fireEvent.changeText(screen.getByTestId('edit-height'), '17');
    fireEvent.press(screen.getByTestId('edit-save'));
    expect(screen.getByTestId('edit-error')).toHaveTextContent(/does not look like a height/);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('replaces the avatar and deletes the old files afterwards', async () => {
    mockProfile = fullProfile;
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    renderWithQuery(<EditProfileScreen />);

    fireEvent.press(await screen.findByTestId('avatar-camera'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        avatarPath: 'images/avatar/full.jpg',
        avatarSmallPath: 'images/avatar/small.jpg',
        avatarStudioPath: null,
      }),
    );
    await waitFor(() =>
      expect(mockRemoved).toEqual(['images/avatar/old.jpg', 'images/avatar/old-small.jpg']),
    );
  });

  it('removes the avatar after confirmation', async () => {
    mockProfile = fullProfile;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    renderWithQuery(<EditProfileScreen />);

    fireEvent.press(await screen.findByTestId('remove-avatar'));

    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith({
        avatarPath: null,
        avatarSmallPath: null,
        avatarStudioPath: null,
      }),
    );
    await waitFor(() => expect(mockRemoved).toHaveLength(2));
  });

  it('drops the studio photo made from the old photo when the photo is replaced', async () => {
    mockProfile = { ...fullProfile, avatarStudioPath: 'images/avatar/studio.png' };
    mockPickPhoto.mockResolvedValue({ status: 'picked', photo });
    renderWithQuery(<EditProfileScreen />);
    fireEvent.press(await screen.findByTestId('avatar-camera'));
    await waitFor(() => expect(mockRemoved).toContain('images/avatar/studio.png'));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ avatarStudioPath: null }));
  });

  it('keeps the avatar when removal is cancelled', async () => {
    mockProfile = fullProfile;
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderWithQuery(<EditProfileScreen />);
    fireEvent.press(await screen.findByTestId('remove-avatar'));
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockRemoved).toHaveLength(0);
  });
});
