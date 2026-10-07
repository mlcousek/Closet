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
import { ManualTryOn } from '@/outfits/ManualTryOn';
import { OutfitImage } from '@/outfits/OutfitImage';
import { hasWishlistItem, outfitRepository, type Outfit } from '@/outfits/repository';
import { useInvalidateOutfits, useOutfit, useRenderSummary } from '@/outfits/useOutfits';
import { useRenderRequest } from '@/outfits/useRenderRequest';
import { ShareSheet } from '@/sharing/ShareSheet';
import { calendarRepository } from '@/planning/calendar';
import { addDays, fromDay } from '@/planning/dates';
import { useToday } from '@/planning/useToday';
import { useInvalidatePlanning } from '@/planning/usePlanning';
import { WearStats } from '@/planning/WearStats';
import { attempt, deleteWithUndo, useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

function OutfitView({ outfit }: { outfit: Outfit }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const invalidateOutfits = useInvalidateOutfits();
  const requestRender = useRenderRequest();
  const summary = useRenderSummary()(outfit);
  const [name, setName] = useState(outfit.name ?? '');
  const [showPrevious, setShowPrevious] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const invalidatePlanning = useInvalidatePlanning();
  const showToast = useToast((state) => state.show);
  // Kept current: a screen left open over midnight must not offer yesterday.
  const currentDay = useToday();
  const planDays = Array.from({ length: 14 }, (_, index) => addDays(currentDay, index));
  const [pickingLookbook, setPickingLookbook] = useState(false);
  const [manual, setManual] = useState(false);

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

      <Button
        testID="outfit-manual-try-on"
        kind="secondary"
        icon="swap-horizontal-outline"
        label={t('manualTryOn.open')}
        onPress={() => setManual(true)}
      />

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
            onPress={() =>
              attempt(() => update({ name: name.trim() || null }), t('common.somethingWentWrong'))
            }
          />
        ) : null}
        <Pressable
          testID="outfit-favourite"
          accessibilityRole="button"
          accessibilityLabel={t('outfits.favourite')}
          accessibilityState={{ selected: outfit.favourite }}
          onPress={() =>
            attempt(() => update({ favourite: !outfit.favourite }), t('common.somethingWentWrong'))
          }
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
          onToggle={(value) =>
            attempt(
              () => update({ seasons: toggled(outfit.seasons, value) }),
              t('common.somethingWentWrong'),
            )
          }
        />
        <AppText variant="label" muted>
          {t('itemForm.occasions')}
        </AppText>
        <Chips
          testIDPrefix="outfit-occasion"
          options={OCCASIONS.map((value) => ({ value, label: t(`taxonomy.occasion.${value}`) }))}
          selected={outfit.occasions}
          onToggle={(value) =>
            attempt(
              () => update({ occasions: toggled(outfit.occasions, value) }),
              t('common.somethingWentWrong'),
            )
          }
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
        {hasWishlistItem(outfit) ? null : (
          <Button
            testID="outfit-plan"
            kind="secondary"
            icon="calendar-outline"
            label={t('planning.plan')}
            onPress={() => setPlanning(true)}
          />
        )}
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
          onPress={() => attempt(() => duplicate(), t('common.somethingWentWrong'))}
        />
        <Button
          testID="outfit-delete"
          kind="danger"
          icon="trash-outline"
          label={t('outfits.delete')}
          onPress={remove}
        />
      </View>
      <WearStats kind="outfit" id={outfit.id} />
      {planning ? (
        <View
          testID="plan-days"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
        >
          {planDays.map((day) => (
            <Pressable
              key={day}
              testID={`plan-day-${day}`}
              accessibilityRole="button"
              onPress={() => {
                setPlanning(false);
                attempt(async () => {
                  await calendarRepository.plan(day, outfit.id);
                  await invalidatePlanning();
                  showToast({ message: t('planning.plannedToast') });
                }, t('common.somethingWentWrong'));
              }}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <AppText variant="label">
                {new Intl.DateTimeFormat(i18n.language, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                }).format(fromDay(day))}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
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
      {manual ? (
        <ManualTryOn
          outfits={[outfit]}
          onClose={() => {
            setManual(false);
            setShowPrevious(false);
          }}
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
