import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips, toggled } from '@/closet/Chips';
import { OCCASIONS, SEASONS, type Occasion, type Season } from '@/closet/taxonomy';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { LookbookPicker } from '@/lookbooks/LookbookPicker';
import { useLookbooks } from '@/lookbooks/useLookbooks';
import { OutfitImage } from '@/outfits/OutfitImage';
import { hasWishlistItem, type Outfit, type OutfitFilter } from '@/outfits/repository';
import { useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { useTheme } from '@/theme/useTheme';

type FilterChip = 'favourite' | Season | Occasion;

const COVER = 84;

export default function OutfitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const [favourite, setFavourite] = useState(false);
  const [season, setSeason] = useState<Season | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState<'selection' | 'new' | null>(null);

  const filter: OutfitFilter = {
    ...(favourite ? { favourite: true } : {}),
    ...(season ? { season } : {}),
    ...(occasion ? { occasion } : {}),
  };
  const filtered = favourite || season !== null || occasion !== null;
  const { data: outfits = [], isPending } = useOutfits(filter);
  // Covers come from all outfits, whatever the grid is filtered to.
  const { data: allOutfits = [] } = useOutfits({});
  const { data: lookbooks = [] } = useLookbooks();
  const summarise = useRenderSummary();
  const selecting = selected.length > 0;

  const toggle = (chip: FilterChip) => {
    if (chip === 'favourite') setFavourite(!favourite);
    else if ((SEASONS as readonly string[]).includes(chip)) {
      setSeason(season === chip ? null : (chip as Season));
    } else setOccasion(occasion === chip ? null : (chip as Occasion));
  };

  const press = (outfit: Outfit) => {
    if (selecting) setSelected(toggled(selected, outfit.id));
    else router.push({ pathname: '/outfit/[id]', params: { id: outfit.id } });
  };

  const byId = new Map(allOutfits.map((outfit) => [outfit.id, outfit]));

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <AppText variant="title">{t('tabs.outfits')}</AppText>

      <ScrollView
        horizontal
        testID="lookbooks-row"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.md }}
      >
        <Pressable
          testID="add-lookbook"
          accessibilityRole="button"
          onPress={() => setPicking('new')}
          style={{ width: COVER, gap: spacing.xs, alignItems: 'center' }}
        >
          <View
            style={{
              width: COVER,
              height: COVER * (4 / 3),
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={28} color={colors.textMuted} />
          </View>
          <AppText variant="caption" muted numberOfLines={1}>
            {t('lookbooks.add')}
          </AppText>
        </Pressable>
        {lookbooks.map((lookbook) => {
          // Without a chosen cover, or when that outfit is gone, the first outfit stands in.
          const cover =
            (lookbook.coverOutfitId ? byId.get(lookbook.coverOutfitId) : undefined) ??
            lookbook.outfitIds.map((id) => byId.get(id)).find((outfit) => !!outfit);
          return (
            <Pressable
              key={lookbook.id}
              testID={`lookbook-${lookbook.id}`}
              accessibilityRole="button"
              accessibilityLabel={lookbook.name}
              onPress={() =>
                router.push({ pathname: '/lookbook/[id]', params: { id: lookbook.id } })
              }
              style={{ width: COVER, gap: spacing.xs }}
            >
              {cover ? (
                <OutfitImage
                  items={cover.entries.map((entry) => entry.item)}
                  summary={summarise(cover)}
                />
              ) : (
                <View
                  style={{
                    width: COVER,
                    height: COVER * (4 / 3),
                    borderRadius: radius.md,
                    backgroundColor: colors.surfaceAlt,
                  }}
                />
              )}
              <AppText variant="caption" numberOfLines={1}>
                {lookbook.name}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <Chips<FilterChip>
        scroll
        testIDPrefix="outfit-filter"
        options={[
          { value: 'favourite', label: t('outfits.favourites') },
          ...SEASONS.map((value) => ({ value, label: t(`taxonomy.season.${value}`) })),
          ...OCCASIONS.map((value) => ({ value, label: t(`taxonomy.occasion.${value}`) })),
        ]}
        selected={[
          ...(favourite ? (['favourite'] as const) : []),
          ...(season ? [season] : []),
          ...(occasion ? [occasion] : []),
        ]}
        onToggle={toggle}
      />
    </View>
  );

  const empty = isPending ? null : filtered ? (
    <EmptyState
      icon="search-outline"
      title={t('outfits.noResultsTitle')}
      message={t('outfits.noResultsMessage')}
    />
  ) : (
    <EmptyState
      icon="albums-outline"
      title={t('empty.outfits.title')}
      message={t('empty.outfits.message')}
      actionLabel={t('empty.outfits.action')}
      onAction={() => router.push('/outfit/edit')}
    />
  );

  return (
    <Screen>
      <FlatList
        testID="outfits-grid"
        data={outfits}
        keyExtractor={(outfit) => outfit.id}
        numColumns={2}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.lg, paddingBottom: 140 }}
        renderItem={({ item: outfit }) => {
          const isSelected = selected.includes(outfit.id);
          return (
            <Pressable
              testID={`outfit-${outfit.id}`}
              accessibilityRole="button"
              accessibilityLabel={outfit.name ?? t('outfits.unnamed')}
              accessibilityState={{ selected: isSelected }}
              onPress={() => press(outfit)}
              onLongPress={() => setSelected(toggled(selected, outfit.id))}
              style={{
                flex: 1 / 2,
                gap: spacing.xs,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: isSelected ? colors.primary : 'transparent',
              }}
            >
              <OutfitImage
                items={outfit.entries.map((entry) => entry.item)}
                summary={summarise(outfit)}
                wishlist={hasWishlistItem(outfit)}
              />
              {outfit.name ? (
                <AppText variant="caption" muted numberOfLines={1}>
                  {outfit.name}
                </AppText>
              ) : null}
            </Pressable>
          );
        }}
      />

      {selecting ? (
        <View
          testID="outfit-selection-bar"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText variant="label" style={{ flex: 1 }}>
              {t('closet.selected', { count: selected.length })}
            </AppText>
            <Pressable testID="outfit-selection-cancel" onPress={() => setSelected([])}>
              <AppText variant="label">{t('common.cancel')}</AppText>
            </Pressable>
          </View>
          <Button
            testID="outfit-selection-lookbook"
            label={t('lookbooks.addTo')}
            onPress={() => setPicking('selection')}
          />
        </View>
      ) : null}

      {picking ? (
        <LookbookPicker
          outfitIds={picking === 'selection' ? selected : []}
          onClose={() => {
            setPicking(null);
            setSelected([]);
          }}
        />
      ) : null}
    </Screen>
  );
}
