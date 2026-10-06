import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { renderQueue } from '@/outfits/renderActions';
import { renderRepository } from '@/outfits/renders';
import { outfitRepository } from '@/outfits/repository';
import { installReminderHandling, restoreReminder } from '@/planning/reminder';
import { useAddActions } from '@/shell/addActions';
import { imageStore } from '@/storage/imageStore';

import { useClosetTab } from './closetTab';
import { itemImageDeps } from './deviceImages';
import { resumeImports, setImportListener, startBulkImport } from './importActions';
import { removeItemImages } from './itemImages';
import { itemRepository } from './repository';
import { invalidateItems } from './useItems';

/** Deleted items keep their photos this long, well past the undo period, before they are purged. */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Wires the closet into the app shell: registers its add actions, resumes an
 * interrupted import and clears out photos of items deleted a while ago.
 */
export function useClosetSetup(): void {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const register = useAddActions((state) => state.register);
  const currentPath = usePathname();
  const pathname = useRef(currentPath);
  useEffect(() => {
    pathname.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    // An item goes to the wishlist only when the add menu is opened on the Wishlist tab itself.
    const target = () =>
      pathname.current === '/closet' && useClosetTab.getState().tab === 'wishlist'
        ? 'wishlist'
        : 'owned';

    const pickMany = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;
      const uris = result.assets.map((asset) => asset.uri);
      Alert.alert(
        t('importFlow.confirmTitle', { count: uris.length }),
        t('importFlow.confirmMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('importFlow.start'),
            onPress: () => {
              void startBulkImport(uris);
              router.push('/import');
            },
          },
        ],
      );
    };

    const unregister = [
      register({
        id: 'item-camera',
        labelKey: 'addItem.menuPhoto',
        icon: 'camera-outline',
        order: 10,
        onPress: () =>
          router.push({ pathname: '/item/new', params: { source: 'camera', target: target() } }),
      }),
      register({
        id: 'item-library',
        labelKey: 'addItem.menuLibrary',
        icon: 'image-outline',
        order: 11,
        onPress: () =>
          router.push({ pathname: '/item/new', params: { source: 'library', target: target() } }),
      }),
      register({
        id: 'item-bulk',
        labelKey: 'addItem.menuBulk',
        icon: 'images-outline',
        order: 12,
        onPress: () => void pickMany(),
      }),
      register({
        id: 'item-link',
        labelKey: 'addItem.menuLink',
        icon: 'link-outline',
        order: 13,
        onPress: () => router.push({ pathname: '/item/link', params: { target: target() } }),
      }),
    ];
    unregister.push(
      register({
        id: 'outfit-create',
        labelKey: 'outfits.menuCreate',
        icon: 'albums-outline',
        order: 20,
        onPress: () => router.push('/outfit/edit'),
      }),
    );
    return () => unregister.forEach((remove) => remove());
  }, [register, router, t]);

  useEffect(() => {
    setImportListener(() => void invalidateItems(queryClient));
    void resumeImports();
    void renderQueue.resume();
    void restoreReminder({ title: t('reminder.title'), body: t('reminder.body') });
    const removeReminderHandling = installReminderHandling(() => router.replace('/'));
    void itemRepository
      .purgeDeleted(Date.now() - PURGE_AFTER_MS)
      .then(async (purged) => {
        // Items that are gone for good no longer belong to any outfit.
        await outfitRepository.forgetItems(purged.map((item) => item.id));
        for (const item of purged) await removeItemImages(item, itemImageDeps);
      })
      .catch(() => {});
    // Outfits deleted a while ago go for good, and with them the try-on pictures nobody sees
    // any more; those are the largest files the app stores.
    void outfitRepository
      .purgeDeleted(Date.now() - PURGE_AFTER_MS)
      .then((gone) => renderRepository.purge(gone))
      .then(async (paths) => {
        for (const path of paths) await imageStore.remove(path).catch(() => {});
      })
      .catch(() => {});
    return () => {
      setImportListener(null);
      removeReminderHandling();
    };
    // The reminder text is read once at start; changing language reschedules it from Settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);
}
