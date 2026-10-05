import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { Chips, toggled } from './Chips';
import { COLOURS, COLOUR_NAMES, OCCASIONS, SEASONS } from './taxonomy';
import { SORTS, type ItemFilter, type ItemSort } from './types';

/** The filter choices the sheet edits; the category and search live on the closet screen. */
export type SheetFilter = Required<Pick<ItemFilter, 'colours' | 'seasons' | 'occasions'>> & {
  brand: string | null;
  archived: boolean;
  sort: ItemSort;
};

export const EMPTY_SHEET_FILTER: SheetFilter = {
  colours: [],
  seasons: [],
  occasions: [],
  brand: null,
  archived: false,
  sort: 'newest',
};

/** How many filters narrow the list (sorting does not count). */
export function activeFilterCount(filter: SheetFilter): number {
  return (
    (filter.colours.length > 0 ? 1 : 0) +
    (filter.seasons.length > 0 ? 1 : 0) +
    (filter.occasions.length > 0 ? 1 : 0) +
    (filter.brand ? 1 : 0) +
    (filter.archived ? 1 : 0)
  );
}

const SORT_LABEL: Record<ItemSort, string> = {
  newest: 'closet.sortNewest',
  name: 'closet.sortName',
  price: 'closet.sortPrice',
  brand: 'closet.sortBrand',
};

export function FilterSheet({
  visible,
  value,
  brands,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: SheetFilter;
  brands: string[];
  onChange: (value: SheetFilter) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const set = (patch: Partial<SheetFilter>) => onChange({ ...value, ...patch });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
      <View
        testID="filter-sheet"
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <AppText variant="heading">{t('closet.filters')}</AppText>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {t('closet.sort')}
            </AppText>
            <Chips
              testIDPrefix="sort"
              options={SORTS.map((sort) => ({ value: sort, label: t(SORT_LABEL[sort]) }))}
              selected={[value.sort]}
              onToggle={(sort) => set({ sort })}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {t('itemForm.colours')}
            </AppText>
            <Chips
              testIDPrefix="filter-colour"
              options={COLOUR_NAMES.map((colour) => ({
                value: colour,
                label: t(`taxonomy.colour.${colour}`),
                swatch: COLOURS[colour],
              }))}
              selected={value.colours}
              onToggle={(colour) => set({ colours: toggled(value.colours, colour) })}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {t('itemForm.seasons')}
            </AppText>
            <Chips
              testIDPrefix="filter-season"
              options={SEASONS.map((season) => ({
                value: season,
                label: t(`taxonomy.season.${season}`),
              }))}
              selected={value.seasons}
              onToggle={(season) => set({ seasons: toggled(value.seasons, season) })}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {t('itemForm.occasions')}
            </AppText>
            <Chips
              testIDPrefix="filter-occasion"
              options={OCCASIONS.map((occasion) => ({
                value: occasion,
                label: t(`taxonomy.occasion.${occasion}`),
              }))}
              selected={value.occasions}
              onToggle={(occasion) => set({ occasions: toggled(value.occasions, occasion) })}
            />
          </View>

          {brands.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="label" muted>
                {t('closet.brand')}
              </AppText>
              <Chips
                testIDPrefix="filter-brand"
                options={brands.map((brand) => ({ value: brand, label: brand }))}
                selected={value.brand ? [value.brand] : []}
                onToggle={(brand) => set({ brand: value.brand === brand ? null : brand })}
              />
            </View>
          ) : null}

          <View style={styles.switchRow}>
            <AppText style={styles.fill}>{t('closet.showArchived')}</AppText>
            <Switch
              testID="filter-archived"
              value={value.archived}
              onValueChange={(archived) => set({ archived })}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={styles.fill}>
              <Button
                testID="filter-clear"
                kind="secondary"
                label={t('common.clear')}
                onPress={() => onChange(EMPTY_SHEET_FILTER)}
              />
            </View>
            <View style={styles.fill}>
              <Button testID="filter-done" label={t('common.done')} onPress={onClose} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%' },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
