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
import { itemRepository } from '@/closet/repository';
import type { ItemDetails } from '@/closet/types';
import { useInvalidateItems } from '@/closet/useItems';
import { AppText, Button, Screen } from '@/components/ui';
import { pickPhoto } from '@/profile/photo';
import { useTheme } from '@/theme/useTheme';

type Params = {
  source?: 'camera' | 'library';
  uri?: string;
  name?: string;
  brand?: string;
  price?: string;
  currency?: string;
  sourceUrl?: string;
};

type Photo = { originalUri: string; cutoutUri: string | null };

/** Adds one item: photo, automatic cutout, suggested details, confirmation. */
export default function NewItemScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { colors, spacing, radius } = useTheme();
  const invalidateItems = useInvalidateItems();

  const [stage, setStage] = useState<'pick' | 'working' | 'tagging' | 'form'>('pick');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [useCutout, setUseCutout] = useState(true);
  const [tags, setTags] = useState<ItemTags | null>(null);
  const [unavailable, setUnavailable] = useState<AiUnavailableReason | null>(null);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const started = useRef(false);

  const prepare = async (uri: string) => {
    setStage('working');
    setTags(null);
    setUnavailable(null);
    const cutout = await itemImageDeps.cutout(uri);
    setPhoto({ originalUri: uri, cutoutUri: cutout?.uri ?? null });
    setUseCutout(cutout !== null);
    setStage('tagging');
    try {
      const image = await toTagImage(cutout?.uri ?? uri, cutout !== null);
      setTags(await tagItem(image, i18n.language === 'cs' ? 'cs' : 'en'));
    } catch (error) {
      setUnavailable(error instanceof AiUnavailableError ? error.reason : 'error');
    }
    setStage('form');
  };

  const pick = async (source: 'camera' | 'library', leaveOnCancel: boolean) => {
    setDenied(false);
    const result = await pickPhoto(source);
    if (result.status === 'denied') {
      setDenied(true);
      return;
    }
    if (result.status === 'cancelled') {
      if (leaveOnCancel) router.back();
      return;
    }
    await prepare(result.photo.uri);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Starting the one-off photo flow is the purpose of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.uri) void prepare(params.uri);
    else if (params.source) void pick(params.source, true);
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
      await itemRepository.create(details, images);
      await invalidateItems();
      router.back();
    } catch {
      setSaveFailed(true);
      setSaving(false);
    }
  };

  const prefilledPrice = params.price ? Number(params.price) : null;
  const initial: Partial<ItemDetails> = {
    ...(tags ?? {}),
    // Details read from a shop page are more reliable than a guess from the photo.
    ...(params.name ? { name: params.name } : {}),
    ...(params.brand ? { brand: params.brand } : {}),
    ...(prefilledPrice !== null && Number.isFinite(prefilledPrice)
      ? { price: prefilledPrice }
      : {}),
    ...(params.currency ? { currency: params.currency } : {}),
    sourceUrl: params.sourceUrl ?? null,
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
        (field) => !(field === 'name' && params.name) && !(field === 'brand' && params.brand),
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
