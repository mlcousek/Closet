import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips, toggled } from '@/closet/Chips';
import { OCCASIONS, SEASONS } from '@/closet/taxonomy';
import { AppText, Button, EmptyState, Field, Screen } from '@/components/ui';
import { KeyNeededPrompt } from '@/ai/KeyNeededPrompt';
import { LookbookPicker } from '@/lookbooks/LookbookPicker';
import { OutfitImage } from '@/outfits/OutfitImage';
import { hasWishlistItem, outfitRepository, type Outfit } from '@/outfits/repository';
import { useInvalidateOutfits, useOutfit, useRenderSummary } from '@/outfits/useOutfits';
import { useRenderRequest } from '@/outfits/useRenderRequest';
import { ShareSheet } from '@/sharing/ShareSheet';
import { deleteWithUndo } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

function OutfitView({ outfit }: { outfit: Outfit }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const invalidateOutfits = useInvalidateOutfits();
  const requestRender = useRenderRequest();
  const summary = useRenderSummary()(outfit);
  const [name, setName] = useState(outfit.name ?? '');
  const [showPrevious, setShowPrevious] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pickingLookbook, setPickingLookbook] = useState(false);

  const update = async (info: Parameters<typeof outfitRepository.updateInfo>[1]) => {
    await outfitRepository.updateInfo(outfit.id, info);
    await invalidateOutfits();
  };

  const duplicate = async () => {
    const copy = await outfitRepository.duplicate(outfit.id);
    if (!copy) return;
    await invalidateOutfits();
    router.replace({ pathname: '/outfit/edit', params: { id: copy.id } });
  };

  const remove = () => {
    Alert.alert(t('outfits.deleteTitle'), t('outfits.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          router.back();
          void deleteWithUndo({
            remove: () => outfitRepository.remove(outfit.id),
            restore: () => outfitRepository.restore(outfit.id),
            message: t('outfits.deletedToast'),
            undoLabel: t('common.undo'),
            onChange: () => void invalidateOutfits(),
          });
        },
      },
    ]);
  };

  const previousPath = showPrevious ? (summary.previous?.imagePath ?? null) : null;
  const failure = summary.failed?.failure ?? null;

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <OutfitImage
        large
        items={outfit.entries.map((entry) => entry.item)}
        summary={summary}
        renderPath={previousPath}
        wishlist={hasWishlistItem(outfit)}
      />

      {summary.pending ? (
        <AppText testID="render-status" muted>
          {t('tryOn.inProgress')}
        </AppText>
      ) : failure ? (
        failure === 'noKey' ? (
          <KeyNeededPrompt provider="image" />
        ) : (
          <AppText testID="render-status" style={{ color: colors.danger }}>
            {t(`tryOn.failure.${failure}`)}
          </AppText>
        )
      ) : summary.outdated ? (
        <AppText testID="render-status" muted>
          {t('tryOn.outdated')}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            testID="outfit-render-button"
            icon="sparkles-outline"
            label={t(
              summary.current ? 'tryOn.regenerate' : failure ? 'common.retry' : 'tryOn.render',
            )}
            disabled={!!summary.pending}
            onPress={() => {
              setShowPrevious(false);
              void requestRender(outfit, summary.current !== null || failure !== null);
            }}
          />
        </View>
        {summary.previous ? (
          <View style={{ flex: 1 }}>
            <Button
              testID="outfit-previous"
              kind="secondary"
              label={t(showPrevious ? 'tryOn.showLatest' : 'tryOn.showPrevious')}
              onPress={() => setShowPrevious(!showPrevious)}
            />
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            testID="outfit-name"
            label={t('outfits.name')}
            value={name}
            onChangeText={setName}
            placeholder={t('outfits.unnamed')}
          />
        </View>
        {name.trim() !== (outfit.name ?? '') ? (
          <Button
            testID="outfit-rename"
            kind="secondary"
            label={t('common.save')}
            onPress={() => void update({ name: name.trim() || null })}
          />
        ) : null}
        <Pressable
          testID="outfit-favourite"
          accessibilityRole="button"
          accessibilityLabel={t('outfits.favourite')}
          accessibilityState={{ selected: outfit.favourite }}
          onPress={() => void update({ favourite: !outfit.favourite })}
          style={{ padding: spacing.md }}
        >
          <Ionicons
            name={outfit.favourite ? 'heart' : 'heart-outline'}
            size={26}
            color={outfit.favourite ? colors.danger : colors.text}
          />
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('itemForm.seasons')}
        </AppText>
        <Chips
          testIDPrefix="outfit-season"
          options={SEASONS.map((value) => ({ value, label: t(`taxonomy.season.${value}`) }))}
          selected={outfit.seasons}
          onToggle={(value) => void update({ seasons: toggled(outfit.seasons, value) })}
        />
        <AppText variant="label" muted>
          {t('itemForm.occasions')}
        </AppText>
        <Chips
          testIDPrefix="outfit-occasion"
          options={OCCASIONS.map((value) => ({ value, label: t(`taxonomy.occasion.${value}`) }))}
          selected={outfit.occasions}
          onToggle={(value) => void update({ occasions: toggled(outfit.occasions, value) })}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('outfits.pieces', { count: outfit.entries.length })}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {outfit.entries.map(({ item }) => (
            <Pressable
              key={item.id}
              testID={`outfit-piece-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={item.name ?? t(`taxonomy.category.${item.category}`)}
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              style={{ width: 84, gap: spacing.xs }}
            >
              <Image
                source={{ uri: imageStore.uri(item.thumbPath) }}
                contentFit="contain"
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surface,
                  opacity: item.ownership === 'archived' ? 0.5 : 1,
                }}
              />
              {item.ownership === 'archived' ? (
                <AppText testID={`piece-archived-${item.id}`} variant="caption" muted>
                  {t('item.archivedBadge')}
                </AppText>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          testID="outfit-share"
          kind="secondary"
          icon="share-outline"
          label={t('share.share')}
          onPress={() => setSharing(true)}
        />
        <Button
          testID="outfit-lookbooks"
          kind="secondary"
          icon="albums-outline"
          label={t('lookbooks.addTo')}
          onPress={() => setPickingLookbook(true)}
        />
        <Button
          testID="outfit-edit"
          kind="secondary"
          icon="create-outline"
          label={t('outfits.edit')}
          onPress={() => router.push({ pathname: '/outfit/edit', params: { id: outfit.id } })}
        />
        <Button
          testID="outfit-duplicate"
          kind="secondary"
          icon="copy-outline"
          label={t('outfits.duplicate')}
          onPress={() => void duplicate()}
        />
        <Button
          testID="outfit-delete"
          kind="danger"
          icon="trash-outline"
          label={t('outfits.delete')}
          onPress={remove}
        />
      </View>
      {sharing ? (
        <ShareSheet
          title={outfit.name}
          outfits={[
            {
              id: outfit.id,
              name: outfit.name,
              items: outfit.entries.map((entry) => entry.item),
              renderPath: summary.current?.imagePath ?? null,
            },
          ]}
          onClose={() => setSharing(false)}
        />
      ) : null}
      {pickingLookbook ? (
        <LookbookPicker outfitIds={[outfit.id]} onClose={() => setPickingLookbook(false)} />
      ) : null}
    </Screen>
  );
}

export default function OutfitScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: outfit, isPending } = useOutfit(id);
  if (isPending) return null;
  if (!outfit) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="help-circle-outline"
          title={t('outfits.title')}
          message={t('outfits.notFound')}
        />
      </Screen>
    );
  }
  // The name field copies the outfit's name once, so a renamed outfit gets a fresh view.
  return <OutfitView key={`${outfit.id}:${outfit.name ?? ''}`} outfit={outfit} />;
}
