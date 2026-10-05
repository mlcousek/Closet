import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/closet/Chips';
import { useClosetTab } from '@/closet/closetTab';
import { COLOURS, isCategory } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { useItems } from '@/closet/useItems';
import { useOutfits } from '@/outfits/useOutfits';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { formatLocale } from '@/i18n/format';
import { calendarRepository } from '@/planning/calendar';
import { today } from '@/planning/dates';
import { formatMoney } from '@/stats/CostPerWear';
import { Bars, ShareBar, Trend } from '@/stats/charts';
import { PERIODS, computeStats, type Period } from '@/stats/stats';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

/** A short list of items with a figure each; tapping one opens the item. */
function ItemList({
  entries,
  testIDPrefix,
}: {
  entries: { item: Item; detail: string }[];
  testIDPrefix: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map(({ item, detail }) => (
        <Pressable
          key={item.id}
          testID={`${testIDPrefix}-${item.id}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
        >
          <Image
            source={{ uri: imageStore.uri(item.thumbPath) }}
            contentFit="contain"
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.sm,
              backgroundColor: colors.surface,
            }}
          />
          <AppText style={{ flex: 1 }} numberOfLines={1}>
            {item.name ?? t(`taxonomy.category.${item.category}`)}
          </AppText>
          <AppText muted>{detail}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

/** What the closet holds and how much of it is actually worn. */
export default function StatsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const [period, setPeriod] = useState<Period>('90d');
  const { data: items, isPending } = useItems({});
  const { data: outfits = [] } = useOutfits({});
  const { data: wears } = useQuery({
    queryKey: ['calendar', 'wearLog'],
    queryFn: () => calendarRepository.wearLog(),
  });
  const locale = formatLocale(i18n.language === 'cs' ? 'cs' : 'en', getLocales()[0]?.regionCode);

  if (isPending || !wears) return null;
  if (!items || items.length === 0) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="stats-chart-outline"
          title={t('stats.emptyTitle')}
          message={t('stats.emptyMessage')}
        />
      </Screen>
    );
  }

  const stats = computeStats({ items, wears, period, today: today() });
  const wearText = (count: number) => t('stats.wears', { count });
  const month = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { month: 'narrow' }).format(
      new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1),
    );

  return (
    <Screen edges={[]} scroll style={{ paddingTop: spacing.lg, gap: spacing.xl }}>
      <Chips
        testIDPrefix="stats-period"
        options={PERIODS.map((value) => ({ value, label: t(`stats.period.${value}`) }))}
        selected={[period]}
        onToggle={setPeriod}
      />

      <Section title={t('stats.overview')}>
        <AppText testID="stats-count">{t('closet.count', { count: stats.itemCount })}</AppText>
        <AppText testID="stats-outfits">{t('stats.outfits', { count: outfits.length })}</AppText>
        {stats.value.map((entry) => (
          <AppText key={entry.currency} testID={`stats-value-${entry.currency || 'none'}`}>
            {t('stats.value', {
              value: formatMoney(entry.total, entry.currency || null, locale),
            })}
          </AppText>
        ))}
        {stats.pricedCount < stats.itemCount ? (
          <AppText testID="stats-price-coverage" variant="caption" muted>
            {t('stats.priceCoverage', { priced: stats.pricedCount, total: stats.itemCount })}
          </AppText>
        ) : null}
      </Section>

      <Section title={t('stats.byCategory')}>
        <Bars
          testIDPrefix="stats-category"
          bars={stats.byCategory.map((entry) => ({
            key: entry.category,
            label: t(`taxonomy.category.${entry.category}`),
            value: entry.count,
          }))}
          onPress={(key) => {
            if (!isCategory(key)) return;
            useClosetTab.getState().showCategory(key);
            // Back to the tabs that are already open, not a second copy of them on top.
            router.dismissTo('/closet');
          }}
        />
      </Section>

      {stats.byColour.length > 0 ? (
        <Section title={t('stats.byColour')}>
          <Bars
            testIDPrefix="stats-colour"
            bars={stats.byColour.slice(0, 8).map((entry) => ({
              key: entry.colour,
              label: t(`taxonomy.colour.${entry.colour}`),
              value: entry.count,
              swatch: COLOURS[entry.colour],
            }))}
          />
        </Section>
      ) : null}

      <Section title={t('stats.usage')}>
        {wears.length === 0 ? (
          <AppText testID="stats-no-wears" muted>
            {t('stats.noWears')}
          </AppText>
        ) : (
          <>
            <AppText testID="stats-usage-share">
              {t('stats.usageShare', {
                percent: Math.round(stats.usageShare * 100),
                worn: stats.itemCount - stats.neverWorn.length,
                total: stats.itemCount,
              })}
            </AppText>
            <ShareBar testID="stats-usage-bar" share={stats.usageShare} />
            <Trend
              testID="stats-trend"
              points={stats.trend.map((point) => ({
                key: point.month,
                label: month(point.month),
                value: point.count,
              }))}
            />
          </>
        )}
      </Section>

      {stats.mostWorn.length > 0 ? (
        <Section title={t('stats.mostWorn')}>
          <ItemList
            testIDPrefix="stats-most"
            entries={stats.mostWorn.map((entry) => ({
              item: entry.item,
              detail: wearText(entry.wears),
            }))}
          />
        </Section>
      ) : null}

      {stats.leastWorn.length > 0 && stats.mostWorn.length >= 5 ? (
        <Section title={t('stats.leastWorn')}>
          <ItemList
            testIDPrefix="stats-least"
            entries={stats.leastWorn.map((entry) => ({
              item: entry.item,
              detail: wearText(entry.wears),
            }))}
          />
        </Section>
      ) : null}

      {wears.length > 0 && stats.neverWorn.length > 0 ? (
        <Section title={t('stats.neverWorn', { count: stats.neverWorn.length })}>
          <ItemList
            testIDPrefix="stats-never"
            entries={stats.neverWorn.slice(0, 8).map((item) => ({ item, detail: '' }))}
          />
        </Section>
      ) : null}

      <Section title={t('stats.costPerWear')}>
        {stats.costPerWear.length === 0 ? (
          <AppText testID="stats-no-cost" muted>
            {t('stats.noCost')}
          </AppText>
        ) : (
          <ItemList
            testIDPrefix="stats-cost"
            entries={stats.costPerWear.slice(0, 5).map((entry) => ({
              item: entry.item,
              detail: formatMoney(entry.cost, entry.item.currency, locale),
            }))}
          />
        )}
      </Section>
    </Screen>
  );
}
