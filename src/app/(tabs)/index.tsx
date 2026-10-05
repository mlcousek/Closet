import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useItemCount } from '@/closet/useItems';
import { AppText, EmptyState, Screen } from '@/components/ui';
import { formatTemperature } from '@/i18n/format';
import { OutfitImage } from '@/outfits/OutfitImage';
import type { Outfit } from '@/outfits/repository';
import { useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { DayPanel } from '@/planning/DayPanel';
import { fromDay, today, weekOf, type Day } from '@/planning/dates';
import { getTemperatureUnit } from '@/planning/settings';
import { useCalendar, useWeather, weatherFor } from '@/planning/usePlanning';
import { conditionOf, type Condition } from '@/planning/weather';
import { greetingKey } from '@/profile/greeting';
import { useProfile } from '@/profile/useProfile';
import { useAddActions } from '@/shell/addActions';
import { useTheme } from '@/theme/useTheme';

const CONDITION_ICON: Record<Condition, React.ComponentProps<typeof Ionicons>['name']> = {
  clear: 'sunny-outline',
  cloudy: 'cloud-outline',
  fog: 'cloud-outline',
  rain: 'rainy-outline',
  snow: 'snow-outline',
  storm: 'thunderstorm-outline',
};

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { data: profile } = useProfile();
  const openMenu = useAddActions((state) => state.openMenu);
  const [selected, setSelected] = useState<Day>(today);
  // Read once when the screen opens; the age shown only needs to be roughly right.
  const [openedAt] = useState(() => Date.now());
  const week = weekOf(today());
  const { data: byDay } = useCalendar(week[0], week[6]);
  const { data: outfits = [] } = useOutfits({});
  const { data: itemCount = 0, isPending: countPending } = useItemCount({});
  const { data: weather } = useWeather();
  const summarise = useRenderSummary();

  const outfitsById = new Map<string, Outfit>(outfits.map((outfit) => [outfit.id, outfit]));
  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'en-GB';
  const unit = getTemperatureUnit();
  const dayWeather = weatherFor(weather, selected);
  const current = weather?.weather?.current ?? null;
  const ageHours = weather?.weather
    ? Math.round((openedAt - weather.weather.fetchedAt) / 3_600_000)
    : 0;

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: 140 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <AppText variant="title" testID="greeting" style={{ flex: 1 }}>
          {profile ? t(greetingKey(), { name: profile.name }) : t('tabs.home')}
        </AppText>
        <Pressable
          testID="open-calendar"
          accessibilityRole="button"
          accessibilityLabel={t('tabs.calendar')}
          onPress={() => router.push('/calendar')}
        >
          <Ionicons name="calendar-outline" size={26} color={colors.text} />
        </Pressable>
      </View>

      <View
        testID="weather-chip"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        {weather?.status === 'needsCity' ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings')}>
            <AppText testID="weather-needs-city" muted>
              {t('weather.chooseCity')}
            </AppText>
          </Pressable>
        ) : current ? (
          <>
            <Ionicons
              name={CONDITION_ICON[conditionOf(current.code)]}
              size={20}
              color={colors.text}
            />
            <AppText>{formatTemperature(current.feelsLike, unit, locale)}</AppText>
            <AppText muted>{t(`weather.condition.${conditionOf(current.code)}`)}</AppText>
            {weather?.status === 'stale' ? (
              <AppText testID="weather-stale" variant="caption" muted>
                {t('weather.updatedAgo', { hours: Math.max(1, ageHours) })}
              </AppText>
            ) : null}
          </>
        ) : weather ? (
          <AppText testID="weather-unavailable" muted>
            {t('weather.unavailable')}
          </AppText>
        ) : null}
      </View>

      <View testID="week-strip" style={{ flexDirection: 'row', gap: spacing.xs }}>
        {week.map((day) => {
          const first = byDay?.get(day)?.find((entry) => outfitsById.has(entry.outfitId));
          const outfit = first ? outfitsById.get(first.outfitId) : undefined;
          const isSelected = day === selected;
          return (
            <Pressable
              key={day}
              testID={`week-day-${day}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelected(day)}
              style={{
                flex: 1,
                gap: spacing.xs,
                alignItems: 'center',
                paddingBottom: spacing.xs,
                borderBottomWidth: 2,
                borderBottomColor: isSelected ? colors.primary : 'transparent',
              }}
            >
              <AppText variant="caption" muted={day !== today()}>
                {new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' }).format(fromDay(day))}
              </AppText>
              <View style={{ width: '100%', aspectRatio: 3 / 4 }}>
                {outfit ? (
                  <OutfitImage
                    items={outfit.entries.map((entry) => entry.item)}
                    summary={summarise(outfit)}
                  />
                ) : (
                  <View
                    style={{ flex: 1, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {!countPending && itemCount < 2 && outfits.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title={t('empty.home.title')}
          message={t('empty.home.message')}
          actionLabel={t('empty.home.action')}
          onAction={openMenu}
        />
      ) : (
        <DayPanel
          // A different day starts over with its own suggestions.
          key={selected}
          day={selected}
          entries={byDay?.get(selected) ?? []}
          outfitsById={outfitsById}
          temperature={
            dayWeather ? dayWeather.feelsMax * 0.7 + dayWeather.feelsMin * 0.3 : undefined
          }
        />
      )}
    </Screen>
  );
}
