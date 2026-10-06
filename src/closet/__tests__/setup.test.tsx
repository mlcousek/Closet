import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import { useAddActions } from '@/shell/addActions';

import { useClosetTab } from '../closetTab';
import { useClosetSetup } from '../useClosetSetup';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockPath = '/';
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPath,
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
const mockQueue = { resume: jest.fn(async () => {}) };
jest.mock('@/outfits/renderActions', () => ({
  renderQueue: { resume: () => mockQueue.resume() },
}));
const mockForget = jest.fn(async (..._args: unknown[]) => {});
const mockPurgeOutfits = jest.fn(async (..._args: unknown[]) => ['old-outfit']);
jest.mock('@/outfits/repository', () => ({
  outfitRepository: {
    forgetItems: (...args: unknown[]) => mockForget(...args),
    purgeDeleted: (...args: unknown[]) => mockPurgeOutfits(...args),
  },
}));
const mockPurgeRenders = jest.fn(async (..._args: unknown[]) => ['images/renders/old.png']);
jest.mock('@/outfits/renders', () => ({
  renderRepository: { purge: (...args: unknown[]) => mockPurgeRenders(...args) },
}));
const mockRemoveFile = jest.fn(async (..._args: unknown[]) => {});
jest.mock('@/storage/imageStore', () => ({
  imageStore: { remove: (...args: unknown[]) => mockRemoveFile(...args) },
}));
jest.mock('@/planning/reminder', () => ({
  restoreReminder: jest.fn(async () => {}),
  installReminderHandling: () => () => {},
}));
jest.mock('../deviceImages', () => ({ itemImageDeps: {} }));
const mockImports = { resume: jest.fn(async () => {}) };
jest.mock('../importActions', () => ({
  resumeImports: () => mockImports.resume(),
  setImportListener: jest.fn(),
  startBulkImport: jest.fn(),
}));
const mockRemoveImages = jest.fn(async (..._args: unknown[]) => {});
jest.mock('../itemImages', () => ({
  removeItemImages: (...args: unknown[]) => mockRemoveImages(...args),
}));
const mockPurge = jest.fn(async (..._args: unknown[]) => [{ id: 'gone' }]);
jest.mock('../repository', () => ({
  itemRepository: { purgeDeleted: (...args: unknown[]) => mockPurge(...args) },
}));
jest.mock('../useItems', () => ({ invalidateItems: jest.fn() }));

function Host() {
  useClosetSetup();
  return null;
}
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Host />
    </QueryClientProvider>,
  );
const action = (id: string) => {
  const found = useAddActions.getState().actions.find((entry) => entry.id === id);
  if (!found) throw new Error(`no add action ${id}`);
  return found;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/';
  useClosetTab.setState({ tab: 'closet', category: null });
});

describe('closet setup', () => {
  it('registers the add actions in order: items first, then create outfit', () => {
    const view = mount();
    expect(useAddActions.getState().actions.map((entry) => entry.id)).toEqual([
      'item-camera',
      'item-library',
      'item-bulk',
      'item-link',
      'outfit-create',
    ]);

    action('item-camera').onPress();
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/item/new',
      params: { source: 'camera', target: 'owned' },
    });
    action('item-library').onPress();
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/item/new',
      params: { source: 'library', target: 'owned' },
    });
    action('outfit-create').onPress();
    expect(mockRouter.push).toHaveBeenLastCalledWith('/outfit/edit');

    view.unmount();
    expect(useAddActions.getState().actions).toEqual([]);
  });

  it('adds to the wishlist only from the Wishlist tab of the closet', () => {
    mockPath = '/closet';
    useClosetTab.setState({ tab: 'wishlist' });
    const view = mount();
    action('item-link').onPress();
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/item/link',
      params: { target: 'wishlist' },
    });

    // The Wishlist tab was left open, but the menu is used from Home.
    mockPath = '/';
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Host />
      </QueryClientProvider>,
    );
    action('item-link').onPress();
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/item/link',
      params: { target: 'owned' },
    });
  });

  it('resumes interrupted work and clears out items deleted long ago', async () => {
    mount();
    expect(mockImports.resume).toHaveBeenCalled();
    expect(mockQueue.resume).toHaveBeenCalled();
    await waitFor(() => expect(mockRemoveImages).toHaveBeenCalledWith({ id: 'gone' }, {}));
    expect(mockForget).toHaveBeenCalledWith(['gone']);
    // Outfits deleted long ago take their try-on pictures with them.
    await waitFor(() => expect(mockRemoveFile).toHaveBeenCalledWith('images/renders/old.png'));
    expect(mockPurgeRenders).toHaveBeenCalledWith(['old-outfit']);
  });
});
