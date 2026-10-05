import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/closet/Chips';
import { CATEGORY_SLOT, SEASONS, type Season, type Slot } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { useItem, useItems } from '@/closet/useItems';
import { AppText, Button, Screen } from '@/components/ui';
import {
  EDITOR_SLOTS,
  addRow,
  draftFromItem,
  draftFromPieces,
  draftPieces,
  emptyDraft,
  isDraftEmpty,
  isMultiSlot,
  isSlotActive,
  removeRow,
  sameOutfit,
  select,
  setHidden,
  shuffle,
  type OutfitDraft,
} from '@/outfits/draft';
import { OutfitCollage } from '@/outfits/OutfitImage';
import { isAutoRenderOn } from '@/outfits/renderActions';
import { outfitRepository, type Outfit } from '@/outfits/repository';
import { SlotCarousel } from '@/outfits/SlotCarousel';
import { useInvalidateOutfits, useOutfit } from '@/outfits/useOutfits';
import { useRenderRequest } from '@/outfits/useRenderRequest';
import { useToast } from '@/shell/toast';
import { useTheme } from '@/theme/useTheme';

type Params = { id?: string; itemId?: string };

function Editor({ outfit, startItem }: { outfit: Outfit | null; startItem: Item | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, spacing, radius } = useTheme();
  const invalidateOutfits = useInvalidateOutfits();
  const requestRender = useRenderRequest();
  const showToast = useToast((state) => state.show);

  const initial = useMemo<OutfitDraft>(() => {
    if (outfit) {
      return draftFromPieces(
        outfit.entries.map((entry) => ({
          itemId: entry.item.id,
          slot: CATEGORY_SLOT[entry.item.category],
          position: entry.position,
        })),
      );
    }
    return startItem ? draftFromItem(startItem) : emptyDraft();
  }, [outfit, startItem]);

  const [draft, setDraft] = useState(initial);
  const [season, setSeason] = useState<Season | null>(null);
  const [saving, setSaving] = useState(false);
  // On from the start when the outfit already involves a wishlist piece.
  const [withWishlist, setWithWishlist] = useState(
    () =>
      startItem?.ownership === 'wishlist' ||
      (outfit?.entries.some((entry) => entry.item.ownership === 'wishlist') ?? false),
  );
  const { data: ownedItems = [] } = useItems({});
  const { data: wished = [] } = useItems({ ownership: 'wishlist' });
  // Wishlist pieces are offered only on request, so a purchase can be judged against the closet.
  // Wishlist pieces that are part of the draft stay available even with the switch off.
  const owned = useMemo(() => {
    const chosen = new Set(draftPieces(draft).map((piece) => piece.itemId));
    const offered = withWishlist ? wished : wished.filter((item) => chosen.has(item.id));
    return [...(startItem ? [startItem] : []), ...ownedItems, ...offered];
  }, [ownedItems, wished, withWishlist, draft, startItem]);

  // Items already in the outfit stay selectable even when archived or filtered out.
  const inOutfit = useMemo(() => outfit?.entries.map((entry) => entry.item) ?? [], [outfit]);
  const itemsBySlot = useMemo(() => {
    const grouped = Object.fromEntries(EDITOR_SLOTS.map((slot) => [slot, [] as Item[]])) as Record<
      Slot,
      Item[]
    >;
    const chosen = new Set(draftPieces(draft).map((piece) => piece.itemId));
    const seen = new Set<string>();
    for (const item of [...inOutfit, ...owned]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const fits = !season || item.seasons.length === 0 || item.seasons.includes(season);
      if (fits || chosen.has(item.id)) grouped[CATEGORY_SLOT[item.category]].push(item);
    }
    return grouped;
  }, [owned, inOutfit, season, draft]);

  const itemsById = useMemo(
    () => new Map([...inOutfit, ...owned].map((item) => [item.id, item])),
    [owned, inOutfit],
  );
  const previewItems = draftPieces(draft)
    .map((piece) => itemsById.get(piece.itemId))
    .filter((item): item is Item => !!item);

  // An outfit started from an item counts as changed, since it is not saved yet.
  const dirty = outfit ? !sameOutfit(draft, initial) : !isDraftEmpty(draft);
  const [leaving, setLeaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState<'back' | { id: string } | null>(null);

  usePreventRemove(dirty && !leaving, ({ data }) => {
    Alert.alert(t('outfitEditor.discardTitle'), t('outfitEditor.discardMessage'), [
      { text: t('outfitEditor.keepEditing'), style: 'cancel' },
      {
        text: t('outfitEditor.discard'),
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  // Leaving after a save happens once the screen has re-rendered without the guard.
  useEffect(() => {
    if (!leaveTo) return;
    if (leaveTo === 'back') router.back();
    else router.replace({ pathname: '/outfit/[id]', params: { id: leaveTo.id } });
  }, [leaveTo, router]);

  const save = async () => {
    const pieces = draftPieces(draft);
    if (pieces.length === 0) return;
    setSaving(true);
    try {
      const saved = outfit
        ? await outfitRepository.setPieces(outfit.id, pieces)
        : await outfitRepository.create(pieces);
      if (!saved) throw new Error('outfit no longer exists');
      await invalidateOutfits();
      showToast({ message: t('outfitEditor.saved') });
      setLeaving(true);
      setLeaveTo(outfit ? 'back' : { id: saved.id });
      // The outfit is saved whatever happens to the render, which runs in the background.
      if (isAutoRenderOn()) void requestRender(saved);
    } catch {
      showToast({ message: t('common.somethingWentWrong') });
      setSaving(false);
    }
  };

  return (
    <Screen scroll edges={['bottom']} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <View
        style={{
          height: 220,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        }}
      >
        {previewItems.length > 0 ? (
          <OutfitCollage items={previewItems} testID="editor-preview" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppText testID="editor-empty" muted>
              {t('outfitEditor.empty')}
            </AppText>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Chips
            scroll
            testIDPrefix="editor-season"
            options={SEASONS.map((value) => ({ value, label: t(`taxonomy.season.${value}`) }))}
            selected={season ? [season] : []}
            onToggle={(value) => setSeason(season === value ? null : value)}
          />
        </View>
        {wished.length > 0 ? (
          <Pressable
            testID="editor-wishlist"
            accessibilityRole="switch"
            accessibilityState={{ checked: withWishlist }}
            accessibilityLabel={t('wishlist.includeInEditor')}
            onPress={() => setWithWishlist(!withWishlist)}
            style={{ padding: spacing.sm }}
          >
            <Ionicons
              name={withWishlist ? 'heart' : 'heart-outline'}
              size={24}
              color={colors.text}
            />
          </Pressable>
        ) : null}
        <Pressable
          testID="editor-shuffle"
          accessibilityRole="button"
          accessibilityLabel={t('outfitEditor.shuffle')}
          onPress={() => setDraft(shuffle(draft, itemsBySlot))}
          style={{ padding: spacing.sm }}
        >
          <Ionicons name="shuffle" size={24} color={colors.text} />
        </Pressable>
      </View>

      {EDITOR_SLOTS.map((slot) => {
        const hidden = draft.hidden.includes(slot);
        const replaced = !hidden && !isSlotActive(draft, slot);
        return (
          <View key={slot} testID={`slot-${slot}`} style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <AppText variant="label" style={{ flex: 1 }}>
                {t(`slot.${slot}`)}
              </AppText>
              {isMultiSlot(slot) && !hidden ? (
                <Pressable
                  testID={`slot-add-${slot}`}
                  accessibilityRole="button"
                  onPress={() => setDraft(addRow(draft, slot))}
                >
                  <AppText variant="label" muted>
                    + {t('outfitEditor.add')}
                  </AppText>
                </Pressable>
              ) : null}
              <Pressable
                testID={`slot-hide-${slot}`}
                accessibilityRole="button"
                onPress={() => setDraft(setHidden(draft, slot, !hidden))}
              >
                <AppText variant="label" muted>
                  {t(hidden ? 'outfitEditor.show' : 'outfitEditor.hide')}
                </AppText>
              </Pressable>
            </View>

            {hidden ? null : replaced ? (
              <AppText testID={`slot-replaced-${slot}`} variant="caption" muted>
                {t('outfitEditor.notNeeded')}
              </AppText>
            ) : itemsBySlot[slot].length === 0 ? (
              <Pressable
                testID={`slot-empty-${slot}`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/item/new', params: { source: 'camera' } })}
              >
                <AppText variant="caption" muted>
                  {t('outfitEditor.noItems')}
                </AppText>
              </Pressable>
            ) : (
              draft.rows[slot].map((selectedId, row) => (
                <View
                  key={row}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
                >
                  <View style={{ flex: 1 }}>
                    <SlotCarousel
                      testID={`carousel-${slot}-${row}`}
                      items={itemsBySlot[slot]}
                      selectedId={selectedId}
                      onSelect={(itemId) => setDraft(select(draft, slot, row, itemId))}
                    />
                  </View>
                  {row > 0 ? (
                    <Pressable
                      testID={`slot-remove-row-${slot}-${row}`}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.remove')}
                      onPress={() => setDraft(removeRow(draft, slot, row))}
                    >
                      <Ionicons name="close-circle" size={22} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </View>
        );
      })}

      <Button
        testID="editor-save"
        icon="checkmark"
        label={t('common.save')}
        disabled={isDraftEmpty(draft)}
        loading={saving}
        onPress={() => void save()}
      />
    </Screen>
  );
}

/** Creates a new outfit, optionally starting from one item, or edits an existing one. */
export default function OutfitEditorScreen() {
  const { id, itemId } = useLocalSearchParams<Params>();
  const { data: outfit, isPending: outfitPending } = useOutfit(id);
  const { data: startItem, isPending: itemPending } = useItem(itemId);
  // The editor copies its starting point into state once, so it mounts only when that is loaded.
  if ((id && outfitPending) || (itemId && itemPending)) return null;
  return <Editor outfit={outfit ?? null} startItem={startItem ?? null} />;
}
