import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips, toggled } from '@/closet/Chips';
import {
  EMPTY_SHEET_FILTER,
  FilterSheet,
  activeFilterCount,
  type SheetFilter,
} from '@/closet/FilterSheet';
import { useClosetTab } from '@/closet/closetTab';
import { itemRepository } from '@/closet/repository';
import { matchesSearch } from '@/closet/search';
import { CATEGORIES, OCCASIONS, SEASONS, type Occasion, type Season } from '@/closet/taxonomy';
import type { Item, ItemFilter } from '@/closet/types';
import {
  useBrands,
  useInvalidateItems,
  useItemCount,
  useItems,
  useWishlistTotals,
} from '@/closet/useItems';
import { AppText, Button, EmptyState, Field, Screen } from '@/components/ui';
import { formatCurrency, formatLocale, formatNumber } from '@/i18n/format';
import { outfitRepository } from '@/outfits/repository';
import { useAddActions } from '@/shell/addActions';
import { attempt, deleteWithUndo, useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

const COLUMNS = 3;

function RetagSheet({
  count,
  onApply,
  onClose,
}: {
  count: number;
  onApply: (patch: { seasons?: Season[]; occasions?: Occasion[] }) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.fill, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View
        testID="retag-sheet"
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          padding: spacing.lg,
          paddingBottom: spacing.xxl,
          gap: spacing.lg,
        }}
      >
        <AppText variant="heading">{t('closet.retagTitle', { count })}</AppText>
        <AppText muted>{t('closet.retagMessage')}</AppText>
        <Chips
          testIDPrefix="retag-season"
          options={SEASONS.map((value) => ({ value, label: t(`taxonomy.season.${value}`) }))}
          selected={seasons}
          onToggle={(value) => setSeasons(toggled(seasons, value))}
        />
        <Chips
          testIDPrefix="retag-occasion"
          options={OCCASIONS.map((value) => ({ value, label: t(`taxonomy.occasion.${value}`) }))}
          selected={occasions}
          onToggle={(value) => setOccasions(toggled(occasions, value))}
        />
        <Button
          testID="retag-apply"
          label={t('common.apply')}
          disabled={seasons.length === 0 && occasions.length === 0}
          onPress={() =>
            onApply({
              ...(seasons.length > 0 ? { seasons } : {}),
              ...(occasions.length > 0 ? { occasions } : {}),
            })
          }
        />
      </View>
    </Modal>
  );
}

export default function ClosetScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const openMenu = useAddActions((state) => state.openMenu);
  const showToast = useToast((state) => state.show);
  const invalidateItems = useInvalidateItems();

  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<SheetFilter>(EMPTY_SHEET_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chosen, setSelected] = useState<string[]>([]);
  const [retagging, setRetagging] = useState(false);

  const { tab, setTab, category, setCategory } = useClosetTab();
  const wishlist = tab === 'wishlist';
  const ownership = wishlist ? 'wishlist' : sheet.archived ? 'archived' : 'owned';
  const { data: wishlistTotals } = useWishlistTotals();
  const locale = formatLocale(i18n.language === 'cs' ? 'cs' : 'en', getLocales()[0]?.regionCode);
  const filter: ItemFilter = {
    ownership,
    category,
    colours: sheet.colours,
    seasons: sheet.seasons,
    occasions: sheet.occasions,
    brand: sheet.brand,
    sort: sheet.sort,
  };
  const { data: listed = [], isPending } = useItems(filter);
  const { data: total = 0 } = useItemCount({ ownership });
  const { data: reviewCount = 0 } = useItemCount({ needsReview: true });
  const { data: brands = [] } = useBrands();

  const items = useMemo(
    () =>
      listed.filter((item) =>
        matchesSearch(item, search, (entry) => [
          t(`taxonomy.category.${entry.category}`),
          entry.subcategory ? t(`taxonomy.subcategory.${entry.subcategory}`) : '',
          ...entry.colours.map((colour) => t(`taxonomy.colour.${colour}`)),
        ]),
      ),
    [listed, search, t],
  );

  // A piece hidden by a search or a filter since it was picked is not silently included.
  const selected = chosen.filter((id) => items.some((item) => item.id === id));
  const selecting = selected.length > 0;
  const filterCount = activeFilterCount(sheet);
  const narrowed = category !== null || search.trim() !== '' || filterCount > 0;

  const clearAll = () => {
    setCategory(null);
    setSearch('');
    setSheet(EMPTY_SHEET_FILTER);
  };

  const press = (item: Item) => {
    if (selecting) setSelected(toggled(selected, item.id));
    else router.push({ pathname: '/item/[id]', params: { id: item.id } });
  };

  const archiveSelected = async () => {
    const ids = selected;
    if (sheet.archived) await itemRepository.unarchive(ids);
    else await itemRepository.archive(ids);
    setSelected([]);
    await invalidateItems();
    if (!sheet.archived) showToast({ message: t('closet.archivedToast') });
  };

  const deleteSelected = async () => {
    const ids = selected;
    // Deleting items also takes them out of the outfits that use them, so say how many.
    const used = await outfitRepository.countUsing(ids);
    const message =
      used > 0
        ? `${t('closet.deleteManyMessage')} ${t('closet.deleteManyUsedMessage', { count: used })}`
        : t('closet.deleteManyMessage');
    Alert.alert(t('closet.deleteManyTitle', { count: ids.length }), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setSelected([]);
          void deleteWithUndo({
            remove: () => itemRepository.remove(ids),
            restore: () => itemRepository.restore(ids),
            message: t('common.deleted'),
            undoLabel: t('common.undo'),
            onChange: () => void invalidateItems(),
          });
        },
      },
    ]);
  };

  const applyRetag = async (patch: { seasons?: Season[]; occasions?: Occasion[] }) => {
    try {
      await itemRepository.updateMany(selected, patch);
      setSelected([]);
      await invalidateItems();
    } finally {
      // Also on failure: the message about it appears under the sheet.
      setRetagging(false);
    }
  };

  const totalText = wishlistTotals
    ? [
        ...wishlistTotals.totals.map((entry) =>
          entry.currency
            ? formatCurrency(entry.amount, entry.currency, locale)
            : formatNumber(entry.amount, locale),
        ),
        ...(wishlistTotals.unpriced > 0
          ? [t('wishlist.unpriced', { count: wishlistTotals.unpriced })]
          : []),
      ].join(' · ')
    : '';

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={styles.titleRow}>
        <AppText variant="title" style={styles.fill}>
          {wishlist
            ? t('wishlist.title')
            : sheet.archived
              ? t('closet.archivedTitle')
              : t('tabs.closet')}
        </AppText>
        <AppText
          testID="closet-count"
          muted
          accessibilityRole={wishlist ? undefined : 'link'}
          onPress={wishlist ? undefined : () => router.push('/stats')}
        >
          {narrowed
            ? t('closet.countFiltered', { shown: items.length, total })
            : t('closet.count', { count: total })}
        </AppText>
      </View>

      {reviewCount > 0 ? (
        <Pressable
          testID="review-banner"
          accessibilityRole="button"
          onPress={() => router.push('/import/review')}
          style={[styles.banner, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md }]}
        >
          <AppText style={styles.fill}>{t('closet.needsReview', { count: reviewCount })}</AppText>
          <AppText variant="label">{t('closet.review')}</AppText>
        </Pressable>
      ) : null}

      <Chips
        testIDPrefix="closet-tab"
        options={[
          { value: 'closet' as const, label: t('tabs.closet') },
          { value: 'wishlist' as const, label: t('wishlist.title') },
        ]}
        selected={[tab]}
        onToggle={(value) => {
          setSelected([]);
          setTab(value);
        }}
      />

      {wishlist && totalText ? (
        <AppText testID="wishlist-total" muted>
          {totalText}
        </AppText>
      ) : null}

      <Field
        testID="closet-search"
        value={search}
        onChangeText={setSearch}
        placeholder={t('closet.searchPlaceholder')}
      />

      <Chips
        scroll
        testIDPrefix="closet-category"
        options={CATEGORIES.map((value) => ({ value, label: t(`taxonomy.category.${value}`) }))}
        selected={category ? [category] : []}
        onToggle={(value) => setCategory(category === value ? null : value)}
      />

      <Pressable
        testID="open-filters"
        accessibilityRole="button"
        onPress={() => setSheetOpen(true)}
        style={styles.filterButton}
      >
        <Ionicons name="options-outline" size={18} color={colors.text} />
        <AppText variant="label">
          {filterCount > 0
            ? t('closet.filtersActive', { count: filterCount })
            : t('closet.filters')}
        </AppText>
      </Pressable>
    </View>
  );

  const empty = isPending ? null : total === 0 && wishlist ? (
    <EmptyState
      icon="heart-outline"
      title={t('wishlist.emptyTitle')}
      message={t('wishlist.emptyMessage')}
      actionLabel={t('wishlist.emptyAction')}
      onAction={() => router.push({ pathname: '/item/link', params: { target: 'wishlist' } })}
    />
  ) : total === 0 && !sheet.archived ? (
    <EmptyState
      icon="shirt-outline"
      title={t('empty.closet.title')}
      message={t('empty.closet.message')}
      actionLabel={t('empty.closet.action')}
      onAction={openMenu}
    />
  ) : (
    <EmptyState
      icon="search-outline"
      title={t('closet.noResultsTitle')}
      message={t('closet.noResultsMessage')}
      actionLabel={narrowed ? t('closet.clearSearch') : undefined}
      onAction={narrowed ? clearAll : undefined}
    />
  );

  return (
    <Screen>
      <FlatList
        testID="closet-grid"
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={{ gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={18}
        windowSize={7}
        renderItem={({ item }) => {
          const isSelected = selected.includes(item.id);
          return (
            <Pressable
              testID={`closet-item-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={item.name ?? t(`taxonomy.category.${item.category}`)}
              accessibilityState={{ selected: isSelected }}
              onPress={() => press(item)}
              onLongPress={() => setSelected(toggled(selected, item.id))}
              style={{ flex: 1 / COLUMNS, gap: spacing.xs }}
            >
              <Image
                source={{ uri: imageStore.uri(item.thumbPath) }}
                contentFit="contain"
                recyclingKey={item.id}
                style={{
                  aspectRatio: 3 / 4,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surface,
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: colors.primary,
                }}
              />
              <AppText variant="caption" muted numberOfLines={1}>
                {item.brand ?? item.name ?? t(`taxonomy.category.${item.category}`)}
              </AppText>
            </Pressable>
          );
        }}
      />

      {selecting ? (
        <View
          testID="selection-bar"
          style={[
            styles.selectionBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radius.md,
              padding: spacing.md,
              gap: spacing.sm,
            },
          ]}
        >
          <View style={styles.titleRow}>
            <AppText variant="label" style={styles.fill}>
              {t('closet.selected', { count: selected.length })}
            </AppText>
            <Pressable testID="selection-cancel" onPress={() => setSelected([])}>
              <AppText variant="label">{t('common.cancel')}</AppText>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {wishlist ? null : (
              <View style={styles.fill}>
                <Button
                  testID="selection-archive"
                  kind="secondary"
                  label={sheet.archived ? t('closet.unarchive') : t('closet.archive')}
                  onPress={() => attempt(() => archiveSelected(), t('common.somethingWentWrong'))}
                />
              </View>
            )}
            <View style={styles.fill}>
              <Button
                testID="selection-retag"
                kind="secondary"
                label={t('closet.retag')}
                onPress={() => setRetagging(true)}
              />
            </View>
            <View style={styles.fill}>
              <Button
                testID="selection-delete"
                kind="danger"
                label={t('common.delete')}
                onPress={() => void deleteSelected()}
              />
            </View>
          </View>
        </View>
      ) : null}

      <FilterSheet
        visible={sheetOpen}
        value={sheet}
        brands={brands}
        onChange={setSheet}
        onClose={() => setSheetOpen(false)}
      />
      {retagging ? (
        <RetagSheet
          count={selected.length}
          onApply={(patch) => attempt(() => applyRetag(patch), t('common.somethingWentWrong'))}
          onClose={() => setRetagging(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  selectionBar: { position: 'absolute', left: 16, right: 16, bottom: 16, borderWidth: 1 },
});
