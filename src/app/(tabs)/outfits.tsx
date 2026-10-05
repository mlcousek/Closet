import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/closet/Chips';
import { OCCASIONS, SEASONS, type Occasion, type Season } from '@/closet/taxonomy';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { OutfitImage } from '@/outfits/OutfitImage';
import type { OutfitFilter } from '@/outfits/repository';
import { useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { useTheme } from '@/theme/useTheme';

type FilterChip = 'favourite' | Season | Occasion;

export default function OutfitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const [favourite, setFavourite] = useState(false);
  const [season, setSeason] = useState<Season | null>(null);
  const [occasion, setOccasion] = useState<Occasion | null>(null);

  const filter: OutfitFilter = {
    ...(favourite ? { favourite: true } : {}),
    ...(season ? { season } : {}),
    ...(occasion ? { occasion } : {}),
  };
  const filtered = favourite || season !== null || occasion !== null;
  const { data: outfits = [], isPending } = useOutfits(filter);
  const summarise = useRenderSummary();

  const toggle = (chip: FilterChip) => {
    if (chip === 'favourite') setFavourite(!favourite);
    else if ((SEASONS as readonly string[]).includes(chip)) {
      setSeason(season === chip ? null : (chip as Season));
    } else setOccasion(occasion === chip ? null : (chip as Occasion));
  };

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <AppText variant="title">{t('tabs.outfits')}</AppText>
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
        renderItem={({ item: outfit }) => (
          <Pressable
            testID={`outfit-${outfit.id}`}
            accessibilityRole="button"
            accessibilityLabel={outfit.name ?? t('outfits.unnamed')}
            onPress={() => router.push({ pathname: '/outfit/[id]', params: { id: outfit.id } })}
            style={{ flex: 1 / 2, gap: spacing.xs }}
          >
            <OutfitImage
              items={outfit.entries.map((entry) => entry.item)}
              summary={summarise(outfit)}
            />
            {outfit.name ? (
              <AppText variant="caption" muted numberOfLines={1}>
                {outfit.name}
              </AppText>
            ) : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}
