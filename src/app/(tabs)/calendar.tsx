import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Screen } from '@/components/ui';
import { OutfitImage } from '@/outfits/OutfitImage';
import type { Outfit } from '@/outfits/repository';
import { useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { DayPanel } from '@/planning/DayPanel';
import { addMonths, fromDay, monthGrid, today, weekOf, type Day } from '@/planning/dates';
import { useCalendar, useStreak, useWeather, weatherFor } from '@/planning/usePlanning';
import { useToday } from '@/planning/useToday';
import { useTheme } from '@/theme/useTheme';

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const [month, setMonth] = useState<Day>(() => addMonths(today(), 0));
  // Re-renders the grid when the date changes, so "today" moves on while the tab stays open.
  useToday();
  const [selected, setSelected] = useState<Day>(today);
  const grid = monthGrid(month);
  const days = grid.flat().filter((day): day is Day => day !== null);
  const { data: byDay } = useCalendar(days[0], days[days.length - 1]);
  const { data: outfits = [] } = useOutfits({});
  const { data: streak = 0 } = useStreak();
  const { data: weather } = useWeather();
  const summarise = useRenderSummary();
  const outfitsById = new Map<string, Outfit>(outfits.map((outfit) => [outfit.id, outfit]));
  const dayWeather = weatherFor(weather, selected);

  const go = (count: number) => {
    const next = addMonths(month, count);
    setMonth(next);
    // Keep a day of the shown month selected: today when it is in view, otherwise the first.
    setSelected(today().slice(0, 7) === next.slice(0, 7) ? today() : next);
  };

  return (
    <Screen scroll style={{ gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: 140 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('tabs.calendar')}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name="flame" size={20} color={streak > 0 ? colors.danger : colors.textMuted} />
          <AppText testID="streak" variant="heading">
            {streak}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          testID="month-previous"
          accessibilityRole="button"
          accessibilityLabel={t('planning.previousMonth')}
          onPress={() => go(-1)}
          style={{ padding: spacing.sm }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <AppText testID="month-title" variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
            fromDay(month),
          )}
        </AppText>
        <Pressable
          testID="month-next"
          accessibilityRole="button"
          accessibilityLabel={t('planning.nextMonth')}
          onPress={() => go(1)}
          style={{ padding: spacing.sm }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {weekOf(today()).map((day) => (
            <AppText key={day} variant="caption" muted style={{ flex: 1, textAlign: 'center' }}>
              {new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' }).format(fromDay(day))}
            </AppText>
          ))}
        </View>
        {grid.map((week, row) => (
          <View key={row} style={{ flexDirection: 'row', gap: spacing.xs }}>
            {week.map((day, column) => {
              if (!day) return <View key={column} style={{ flex: 1 }} />;
              const entries = byDay?.get(day) ?? [];
              const live = entries.filter((entry) => outfitsById.has(entry.outfitId));
              const outfit = live[0] ? outfitsById.get(live[0].outfitId) : undefined;
              const isSelected = day === selected;
              return (
                <Pressable
                  key={day}
                  testID={`calendar-day-${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelected(day)}
                  style={{
                    flex: 1,
                    aspectRatio: 3 / 4.6,
                    borderRadius: radius.sm,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.primary : 'transparent',
                    padding: 1,
                    gap: 1,
                  }}
                >
                  <AppText
                    variant="caption"
                    style={{
                      textAlign: 'center',
                      fontWeight: day === today() ? '700' : '400',
                    }}
                  >
                    {fromDay(day).getDate()}
                  </AppText>
                  <View style={{ flex: 1, opacity: live[0]?.state === 'planned' ? 0.55 : 1 }}>
                    {outfit ? (
                      <OutfitImage
                        items={outfit.entries.map((entry) => entry.item)}
                        summary={summarise(outfit)}
                      />
                    ) : null}
                  </View>
                  {live.length > 1 ? (
                    <AppText
                      testID={`calendar-more-${day}`}
                      variant="caption"
                      muted
                      style={{ textAlign: 'center' }}
                    >
                      +{live.length - 1}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <AppText testID="selected-day" variant="heading">
        {new Intl.DateTimeFormat(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(fromDay(selected))}
      </AppText>
      <DayPanel
        key={selected}
        day={selected}
        entries={byDay?.get(selected) ?? []}
        outfitsById={outfitsById}
        temperature={dayWeather ? dayWeather.feelsMax * 0.7 + dayWeather.feelsMin * 0.3 : undefined}
      />
    </Screen>
  );
}
