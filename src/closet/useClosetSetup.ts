import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { renderQueue } from '@/outfits/renderActions';
import { outfitRepository } from '@/outfits/repository';
import { useAddActions } from '@/shell/addActions';

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

  useEffect(() => {
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
        onPress: () => router.push({ pathname: '/item/new', params: { source: 'camera' } }),
      }),
      register({
        id: 'item-library',
        labelKey: 'addItem.menuLibrary',
        icon: 'image-outline',
        order: 11,
        onPress: () => router.push({ pathname: '/item/new', params: { source: 'library' } }),
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
        onPress: () => router.push('/item/link'),
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
    void itemRepository
      .purgeDeleted(Date.now() - PURGE_AFTER_MS)
      .then(async (purged) => {
        // Items that are gone for good no longer belong to any outfit.
        await outfitRepository.forgetItems(purged.map((item) => item.id));
        for (const item of purged) await removeItemImages(item, itemImageDeps);
      })
      .catch(() => {});
    return () => setImportListener(null);
  }, [queryClient]);
}
