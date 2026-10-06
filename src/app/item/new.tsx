import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AiUnavailableError, type AiUnavailableReason } from '@/ai/client';
import { tagItem, type ItemTags } from '@/ai/tagging';
import { Chips } from '@/closet/Chips';
import { itemImageDeps, toTagImage } from '@/closet/deviceImages';
import { ItemForm } from '@/closet/ItemForm';
import { storeItemImages } from '@/closet/itemImages';
import { usePendingLink, type PendingLinkItem } from '@/closet/pendingLink';
import { itemRepository } from '@/closet/repository';
import type { ItemDetails } from '@/closet/types';
import { useInvalidateItems } from '@/closet/useItems';
import { AppText, Button, Screen } from '@/components/ui';
import { pickPhoto } from '@/profile/photo';
import { useTheme } from '@/theme/useTheme';

type Params = { source?: 'camera' | 'library' | 'link'; target?: string };

type Photo = { originalUri: string; cutoutUri: string | null };

/** Adds one item: photo, automatic cutout, suggested details, confirmation. */
export default function NewItemScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { source, target: targetParam } = useLocalSearchParams<Params>();
  const { colors, spacing, radius } = useTheme();
  const invalidateItems = useInvalidateItems();

  const [stage, setStage] = useState<'pick' | 'working' | 'tagging' | 'form'>('pick');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [useCutout, setUseCutout] = useState(true);
  const [tags, setTags] = useState<ItemTags | null>(null);
  const [fromLink, setFromLink] = useState<PendingLinkItem | null>(null);
  const [unavailable, setUnavailable] = useState<AiUnavailableReason | null>(null);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const started = useRef(false);
  // Decided by where the add was started: the Wishlist tab passes it along, also through link import.
  // A link import brings its own target, which has to outlive the link's photo being replaced.
  const [linkTarget, setLinkTarget] = useState<'owned' | 'wishlist' | null>(null);
  const target: 'owned' | 'wishlist' =
    (linkTarget ?? targetParam) === 'wishlist' ? 'wishlist' : 'owned';

  const prepare = async (uri: string, size?: { width: number; height: number }) => {
    setStage('working');
    setTags(null);
    setUnavailable(null);
    const cutout = await itemImageDeps.cutout(uri);
    setPhoto({ originalUri: uri, cutoutUri: cutout?.uri ?? null });
    setUseCutout(cutout !== null);
    setStage('tagging');
    try {
      const image = await toTagImage(cutout?.uri ?? uri, cutout !== null, cutout ?? size);
      setTags(await tagItem(image, i18n.language === 'cs' ? 'cs' : 'en'));
    } catch (error) {
      setUnavailable(error instanceof AiUnavailableError ? error.reason : 'error');
    }
    setStage('form');
  };

  const pick = async (from: 'camera' | 'library', leaveOnCancel: boolean) => {
    setDenied(false);
    const result = await pickPhoto(from);
    if (result.status === 'denied') {
      setDenied(true);
      return;
    }
    if (result.status === 'cancelled') {
      if (leaveOnCancel) router.back();
      // Changing one's mind about another photo goes back to the form as it was.
      else if (photo) setStage('form');
      return;
    }
    // A photo chosen here replaces anything that came from a shop link.
    setFromLink(null);
    await prepare(result.photo.uri, result.photo);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (source === 'link') {
      const pending = usePendingLink.getState().take();
      if (pending) {
        // Starting the one-off photo flow is the purpose of this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFromLink(pending);
        setLinkTarget(pending.target);
        void prepare(pending.uri);
      }
    } else if (source === 'library') {
      void pick('library', true);
    }
    // The camera is not opened automatically: the capture tip is shown first.
    // Runs once for the parameters the screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (details: ItemDetails) => {
    if (!photo) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const images = await storeItemImages(
        { originalUri: photo.originalUri, cutoutUri: useCutout ? photo.cutoutUri : null },
        itemImageDeps,
      );
      await itemRepository.create(details, images, { ownership: target });
      await invalidateItems();
      router.back();
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const initial: Partial<ItemDetails> = {
    ...(tags ?? {}),
    // Details read from a shop page are more reliable than a guess from the photo.
    ...(fromLink?.name ? { name: fromLink.name } : {}),
    ...(fromLink?.brand ? { brand: fromLink.brand } : {}),
    ...(fromLink && fromLink.price !== null ? { price: fromLink.price } : {}),
    ...(fromLink?.currency ? { currency: fromLink.currency } : {}),
    sourceUrl: fromLink?.sourceUrl ?? null,
  };
  const suggested = tags
    ? (
        [
          'name',
          'category',
          'subcategory',
          'colours',
          'seasons',
          'occasions',
          'warmth',
          'brand',
        ] as const
      ).filter(
        (field) => !(field === 'name' && fromLink?.name) && !(field === 'brand' && fromLink?.brand),
      )
    : [];

  if (stage === 'pick') {
    return (
      <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
        <AppText testID="capture-tip" muted>
          {t('addItem.tip')}
        </AppText>
        {denied ? (
          <View
            testID="add-item-denied"
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.md,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <AppText>{t('addItem.denied')}</AppText>
            <Button
              kind="secondary"
              label={t('avatar.openSystemSettings')}
              onPress={() => void Linking.openSettings()}
            />
          </View>
        ) : null}
        <Button
          testID="add-item-camera"
          icon="camera-outline"
          label={t('addItem.takePhoto')}
          onPress={() => void pick('camera', false)}
        />
        <Button
          testID="add-item-library"
          icon="images-outline"
          kind="secondary"
          label={t('addItem.choosePhoto')}
          onPress={() => void pick('library', false)}
        />
        {photo ? (
          <Button
            testID="add-item-keep-photo"
            kind="secondary"
            label={t('addItem.keepPhoto')}
            onPress={() => setStage('form')}
          />
        ) : null}
      </Screen>
    );
  }

  if (stage === 'working' || stage === 'tagging' || !photo) {
    return (
      <Screen
        edges={[]}
        style={{ alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}
      >
        <ActivityIndicator color={colors.text} />
        <AppText testID="add-item-progress" muted>
          {t(stage === 'tagging' ? 'addItem.tagging' : 'addItem.working')}
        </AppText>
        {stage === 'tagging' && photo ? (
          // Suggestions are a convenience; on a slow connection the form must not wait for them.
          <Button
            testID="add-item-skip-tagging"
            kind="secondary"
            label={t('addItem.skipTagging')}
            onPress={() => setStage('form')}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Image
        testID="item-preview"
        source={{ uri: useCutout && photo.cutoutUri ? photo.cutoutUri : photo.originalUri }}
        contentFit="contain"
        style={{ height: 280, borderRadius: radius.md, backgroundColor: colors.surface }}
      />
      {photo.cutoutUri ? (
        <Chips
          testIDPrefix="image-choice"
          options={[
            { value: 'cutout', label: t('addItem.useCutout') },
            { value: 'original', label: t('addItem.useOriginal') },
          ]}
          selected={[useCutout ? 'cutout' : 'original']}
          onToggle={(value) => setUseCutout(value === 'cutout')}
        />
      ) : (
        <AppText testID="no-cutout-notice" muted>
          {t('addItem.noCutout')}
        </AppText>
      )}
      <Button
        testID="another-photo"
        kind="secondary"
        label={t('addItem.anotherPhoto')}
        onPress={() => setStage('pick')}
      />
      {target === 'wishlist' ? (
        <AppText testID="saving-to-wishlist" variant="label" muted>
          {t('wishlist.savingTo')}
        </AppText>
      ) : null}
      {unavailable ? (
        <AppText testID="tags-unavailable" muted>
          {t(`addItem.tagsUnavailable.${unavailable}`)}
        </AppText>
      ) : null}
      {saveFailed ? (
        <AppText testID="save-failed" style={{ color: colors.danger }}>
          {t('addItem.saveFailed')}
        </AppText>
      ) : null}
      <ItemForm
        // A new photo brings new suggestions, so the form starts over.
        key={photo.originalUri}
        initial={initial}
        suggested={[...suggested]}
        submitLabel={t('itemForm.save')}
        busy={saving}
        onSubmit={(details) => void save(details)}
      />
    </Screen>
  );
}
