import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import type { Profile } from '@/profile/types';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (props: object) => <View {...props} /> };
});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { uri: (path: string) => `file:///documents/${path}` },
}));

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

let mockRegion: string | null = 'CZ';
jest.mock('expo-localization', () => ({
  getLocales: () => (mockRegion === null ? [] : [{ regionCode: mockRegion }]),
}));

let mockProfile: Profile | null | undefined;
jest.mock('@/profile/useProfile', () => ({ useProfile: () => ({ data: mockProfile }) }));

const profile = (patch: Partial<Profile> = {}): Profile => ({
  id: 'me',
  name: 'Auri',
  gender: null,
  bodyType: null,
  heightCm: null,
  sizeTop: null,
  sizeBottom: null,
  sizeShoes: null,
  avatarPath: null,
  avatarSmallPath: null,
  avatarStudioPath: null,
  ...patch,
});
const complete = profile({
  gender: 'woman',
  bodyType: 'curvy',
  heightCm: 170,
  sizeTop: 'M',
  sizeBottom: '38',
  sizeShoes: '39 EU',
  avatarPath: 'images/avatar/me.jpg',
});

/** Every text on the screen in order, so a value can be checked next to its label. */
const page = () => screen.getByTestId('page');
const show = () =>
  render(
    <View testID="page">
      <ProfileScreen />
    </View>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRegion = 'CZ';
  mockProfile = complete;
});

describe('profile tab', () => {
  it('shows the photo, the name and every detail of a complete profile', () => {
    show();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Auri');
    expect(screen.getByTestId('profile-avatar').props.source).toEqual({
      uri: 'file:///documents/images/avatar/me.jpg',
    });
    expect(screen.queryByTestId('profile-no-avatar')).toBeNull();

    expect(page()).toHaveTextContent(/GenderWoman/);
    expect(page()).toHaveTextContent(/Body typeCurvy/);
    expect(page()).toHaveTextContent(/Height170 cm/);
    expect(page()).toHaveTextContent(/TopsM/);
    expect(page()).toHaveTextContent(/Bottoms38/);
    expect(page()).toHaveTextContent(/Shoes39 EU/);
    expect(screen.queryByText('Not set')).toBeNull();
  });

  it('says so when there is no photo', () => {
    mockProfile = profile({ gender: 'man' });
    show();
    expect(screen.getByTestId('profile-no-avatar')).toHaveTextContent('No photo yet');
    expect(screen.queryByTestId('profile-avatar')).toBeNull();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Auri');
  });

  it('marks every detail that was left empty as not set', () => {
    mockProfile = profile();
    show();
    expect(page()).toHaveTextContent(/GenderNot set/);
    expect(page()).toHaveTextContent(/Body typeNot set/);
    expect(page()).toHaveTextContent(/HeightNot set/);
    expect(page()).toHaveTextContent(/TopsNot set/);
    expect(page()).toHaveTextContent(/BottomsNot set/);
    expect(page()).toHaveTextContent(/ShoesNot set/);
    expect(screen.getAllByText('Not set')).toHaveLength(6);
  });

  it('mixes filled and empty details', () => {
    mockProfile = profile({ gender: 'unspecified', bodyType: 'athletic', sizeShoes: '44' });
    show();
    expect(page()).toHaveTextContent(/GenderPrefer not to say/);
    expect(page()).toHaveTextContent(/Body typeAthletic/);
    expect(page()).toHaveTextContent(/Shoes44/);
    expect(screen.getAllByText('Not set')).toHaveLength(3);
  });

  it.each([
    ['CZ', 170, '170 cm'],
    ['GB', 182, '182 cm'],
    ['US', 170, '5′ 7″'],
    ['US', 183, '6′ 0″'],
    ['us', 152, '5′ 0″'],
  ])('formats the height for region %s: %i cm as %s', (region, heightCm, text) => {
    mockRegion = region;
    mockProfile = profile({ heightCm });
    show();
    expect(page()).toHaveTextContent(new RegExp(`Height${text}Tops`));
  });

  it('uses centimetres when the device reports no region', () => {
    mockRegion = null;
    show();
    expect(page()).toHaveTextContent(/Height170 cm/);
  });

  it.each([
    ['edit-profile', 'Edit profile', '/profile/edit'],
    ['open-stylist', 'AI stylist', '/stylist'],
    ['open-stats', 'Closet statistics', '/stats'],
    ['open-trips', 'Trips', '/trips'],
    ['open-display', 'Display mode', '/display'],
    ['open-settings', 'Settings', '/settings'],
  ])('%s is labelled "%s" and opens %s', (testID, label, route) => {
    show();
    expect(screen.getByTestId(testID)).toHaveTextContent(new RegExp(label));
    fireEvent.press(screen.getByTestId(testID));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith(route);
  });

  it('still offers the other sections while the profile is not loaded', () => {
    mockProfile = undefined;
    show();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.queryByTestId('profile-name')).toBeNull();
    expect(screen.queryByTestId('edit-profile')).toBeNull();
    expect(screen.queryByText('Height')).toBeNull();

    fireEvent.press(screen.getByTestId('open-settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
    for (const testID of ['open-stylist', 'open-stats', 'open-trips', 'open-display']) {
      expect(screen.getByTestId(testID)).toBeTruthy();
    }
  });
});
