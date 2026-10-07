import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { getLocales } from 'expo-localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AiUnavailableError } from '@/ai/client';
import { useKeyInfo } from '@/ai/useKeyInfo';
import { Chips } from '@/closet/Chips';
import { OCCASIONS, type Occasion } from '@/closet/taxonomy';
import type { Item } from '@/closet/types';
import { useItems, useItemsById } from '@/closet/useItems';
import { AppText, Button, EmptyState, Field, Screen } from '@/components/ui';
import { formatLocale, formatTemperature } from '@/i18n/format';
import { OutfitCollage } from '@/outfits/OutfitImage';
import { usageLog } from '@/outfits/renders';
import { outfitRepository } from '@/outfits/repository';
import { useInvalidateOutfits } from '@/outfits/useOutfits';
import { calendarRepository } from '@/planning/calendar';
import { fromDay, today } from '@/planning/dates';
import { getTemperatureUnit } from '@/planning/settings';
import { useInvalidatePlanning } from '@/planning/usePlanning';
import { conditionOf } from '@/planning/weather';
import { useProfile } from '@/profile/useProfile';
import { deleteWithUndo, useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';
import { dayInputs, generateTrip, styleTrip } from '@/trips/actions';
import { tripWeather } from '@/trips/forecast';
import { packingList, pickDayOutfit, shoeLimitFor } from '@/trips/plan';
import { isDisclosed, setDisclosed } from '@/stylist/sessions';
import { TRIPS, addTripToCalendar, tripRepository, type Trip } from '@/trips/repository';

function Check({
  checked,
  label,
  detail,
  onToggle,
  onRemove,
  testID,
}: {
  checked: boolean;
  label: string;
  detail?: string;
  onToggle: () => void;
  onRemove?: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={onToggle}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={24}
          color={checked ? colors.success : colors.textMuted}
        />
        <View style={{ flex: 1 }}>
          <AppText style={checked ? { textDecorationLine: 'line-through' } : undefined}>
            {label}
          </AppText>
          {detail ? (
            <AppText variant="caption" muted>
              {detail}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable
          testID={`${testID}-remove`}
          accessibilityRole="button"
          accessibilityLabel={t('common.remove')}
          hitSlop={8}
          onPress={onRemove}
        >
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function TripView({ trip }: { trip: Trip }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const { colors, spacing, radius } = useTheme();
  const showToast = useToast((state) => state.show);
  const invalidateOutfits = useInvalidateOutfits();
  const invalidatePlanning = useInvalidatePlanning();
  const { data: owned = [] } = useItems({});
  const { data: keyInfo } = useKeyInfo('anthropic');
  const { data: profile } = useProfile();
  const dayList = trip.days.map((day) => day.day);
  const { data: weather = [], isPending: weatherPending } = useQuery({
    // Not under the trips key: a ticked packing item must not ask for the weather again.
    queryKey: ['trip-weather', trip.id, trip.startDay, trip.endDay],
    queryFn: () => tripWeather(trip.place, dayList),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  // Pieces that were archived or are extras from outside the owned list still have to show.
  const referenced = [
    ...new Set([
      ...trip.days.flatMap((day) => day.pieces.map((piece) => piece.itemId)),
      ...trip.packing.filter((entry) => entry.kind !== 'text').map((entry) => entry.key),
    ]),
  ].filter((id) => !owned.some((item) => item.id === id));
  const { data: others = [] } = useItemsById(referenced);

  const [busy, setBusy] = useState<'suggest' | 'stylist' | 'calendar' | null>(null);
  const [shown, setShown] = useState<Record<string, string[]>>({});
  const [extraText, setExtraText] = useState('');
  const [picking, setPicking] = useState(false);

  const items = new Map<string, Item>([...owned, ...others].map((item) => [item.id, item]));
  const locale = formatLocale(i18n.language === 'cs' ? 'cs' : 'en', getLocales()[0]?.regionCode);
  const unit = getTemperatureUnit();
  const inputs = dayInputs(trip, weather);
  // A day that is in the calendar changes its saved outfit too, so outfits are read again.
  const refresh = () =>
    Promise.all([client.invalidateQueries({ queryKey: [TRIPS] }), invalidateOutfits()]);
  const change = async (action: () => Promise<unknown>) => {
    await action();
    await refresh();
  };
  const keyOf = (pieces: { itemId: string }[]) =>
    pieces
      .map((piece) => piece.itemId)
      .sort()
      .join(',');

  /** Chooses another outfit for one day, never one already shown for it. */
  const repick = async (index: number, activity: Occasion | null) => {
    const day = trip.days[index];
    const seen = [...(shown[day.day] ?? []), keyOf(day.pieces)];
    const pieces = pickDayOutfit({
      tripSeed: trip.id,
      day: { ...inputs[index], activity },
      owned,
      others: trip.days.filter((_, other) => other !== index).map((entry) => entry.pieces),
      shoeLimit: shoeLimitFor(trip.days.length),
      exclude: seen,
      salt: seen.length,
    });
    if (pieces.length === 0) {
      showToast({ message: t('trips.noAlternative') });
      if (activity !== day.activity)
        await change(() => tripRepository.setDay(trip.id, day.day, { activity }));
      return;
    }
    setShown({ ...shown, [day.day]: seen });
    await change(() => tripRepository.setDay(trip.id, day.day, { pieces, activity }));
  };

  const suggestNow = async () => {
    setBusy('suggest');
    try {
      // A different round every time, also after leaving the screen, so asking again really
      // gives another plan and never quietly the first one.
      await generateTrip(
        trip,
        owned,
        weather.length > 0 ? weather : undefined,
        undefined,
        Date.now() % 1_000_000,
      );
      setShown({});
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  /** Asks before outfits that are already there, chosen by hand or paid for, are replaced. */
  const confirmReplace = (action: () => void) => {
    if (!trip.days.some((day) => day.pieces.length > 0)) {
      action();
      return;
    }
    Alert.alert(t('trips.replaceTitle'), t('trips.replaceMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('trips.replaceAction'), onPress: action },
    ]);
  };
  const suggest = () => confirmReplace(() => void suggestNow());

  /** The stylist explains once what it sends, wherever it is first used. */
  const askStylist = () => {
    const proceed = () => confirmReplace(() => void askStylistNow());
    if (isDisclosed()) {
      proceed();
      return;
    }
    Alert.alert(t('stylist.disclosureTitle'), t('stylist.disclosure'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('stylist.disclosureAccept'),
        onPress: () => {
          setDisclosed();
          proceed();
        },
      },
    ]);
  };

  const askStylistNow = async () => {
    setBusy('stylist');
    try {
      const filled = await styleTrip(trip, weather, {
        items: owned,
        language: i18n.language === 'cs' ? 'cs' : 'en',
        hints: { gender: profile?.gender ?? null, bodyType: profile?.bodyType ?? null },
        wearCounts: await calendarRepository.wearCounts(owned.map((item) => item.id)),
        onAnswered: () => usageLog.record('stylist'),
      });
      await refresh();
      if (filled === 0) showToast({ message: t('trips.stylistIncomplete') });
    } catch (error) {
      const reason = error instanceof AiUnavailableError ? error.reason : 'error';
      showToast({ message: t(`stylist.errors.${reason}`) });
    } finally {
      setBusy(null);
    }
  };

  const addToCalendar = async () => {
    setBusy('calendar');
    try {
      const format = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'numeric' });
      const added = await addTripToCalendar(trip, {
        createOutfit: (pieces, name) => outfitRepository.create(pieces, { name }),
        outfitExists: async (id) => (await outfitRepository.get(id)) !== null,
        plan: (day, outfitId) => calendarRepository.plan(day, outfitId),
        setDay: tripRepository.setDay,
        today: today(),
        nameFor: (day) => `${trip.name} · ${format.format(fromDay(day))}`,
      });
      await Promise.all([refresh(), invalidateOutfits(), invalidatePlanning()]);
      showToast({
        message: t(added > 0 ? 'trips.addedToCalendar' : 'trips.nothingToAdd', { count: added }),
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    Alert.alert(t('trips.deleteTitle'), t('trips.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          router.back();
          void deleteWithUndo({
            remove: () => tripRepository.remove(trip.id),
            restore: () => tripRepository.restore(trip.id),
            message: t('trips.deletedToast'),
            undoLabel: t('common.undo'),
            onChange: () => void refresh(),
          });
        },
      },
    ]);
  };

  const extraIds = trip.packing.filter((entry) => entry.kind === 'extra').map((entry) => entry.key);
  const groups = packingList(trip.days, [...items.values()], extraIds);
  const outfitIds = new Set(trip.days.flatMap((day) => day.pieces.map((piece) => piece.itemId)));
  const packedIds = new Set(
    trip.packing.filter((entry) => entry.kind !== 'text' && entry.packed).map((entry) => entry.key),
  );
  const texts = trip.packing.filter((entry) => entry.kind === 'text');
  const listed = groups.flatMap((group) => group.entries.map((entry) => entry.item.id));
  const total = listed.length + texts.length;
  const packed =
    listed.filter((id) => packedIds.has(id)).length + texts.filter((entry) => entry.packed).length;
  const dayNumber = (day: string) => dayList.indexOf(day) + 1;
  const hasOutfits = trip.days.some((day) => day.pieces.length > 0);
  const addable = owned.filter((item) => !listed.includes(item.id));

  return (
    <Screen edges={[]} scroll style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title" testID="trip-title">
          {trip.name}
        </AppText>
        <AppText muted>{trip.place.name}</AppText>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          testID="trip-suggest"
          kind={hasOutfits ? 'secondary' : 'primary'}
          icon="shuffle"
          label={t(hasOutfits ? 'trips.suggestAgain' : 'trips.suggest')}
          loading={busy === 'suggest'}
          disabled={busy !== null}
          onPress={suggest}
        />
        {keyInfo?.hasKey ? (
          <Button
            testID="trip-stylist"
            kind="secondary"
            icon="sparkles-outline"
            label={t('trips.askStylist')}
            loading={busy === 'stylist'}
            // The request describes each day's weather, so it waits until that has loaded.
            disabled={busy !== null || weatherPending}
            onPress={askStylist}
          />
        ) : null}
      </View>

      {trip.days.map((day, index) => {
        const conditions = weather.find((entry) => entry.day === day.day);
        const pieces = day.pieces.filter((piece) => items.has(piece.itemId));
        return (
          <View
            key={day.day}
            testID={`trip-day-${day.day}`}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: spacing.md,
              gap: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="label">
                {new Intl.DateTimeFormat(i18n.language, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                }).format(fromDay(day.day))}
              </AppText>
              {conditions?.weather ? (
                <AppText testID={`trip-weather-${day.day}`} variant="label" muted>
                  {`${formatTemperature(conditions.weather.feelsMin, unit, locale)} – ${formatTemperature(conditions.weather.feelsMax, unit, locale)} · ${t(`weather.condition.${conditionOf(conditions.weather.code)}`)}${conditions.typical ? ` · ${t('trips.typical')}` : ''}`}
                </AppText>
              ) : (
                <AppText testID={`trip-weather-${day.day}`} variant="label" muted>
                  {t('trips.noForecast')}
                </AppText>
              )}
            </View>
            <Chips
              testIDPrefix={`trip-activity-${day.day}`}
              scroll
              options={OCCASIONS.map((occasion) => ({
                value: occasion,
                label: t(`taxonomy.occasion.${occasion}`),
              }))}
              selected={day.activity ? [day.activity] : []}
              onToggle={(occasion) => {
                if (busy !== null || weatherPending) return;
                void repick(index, day.activity === occasion ? null : occasion);
              }}
            />
            {pieces.length > 0 ? (
              <View style={{ height: 180 }}>
                <OutfitCollage
                  testID={`trip-collage-${day.day}`}
                  items={pieces.map((piece) => items.get(piece.itemId)!)}
                />
              </View>
            ) : (
              <AppText testID={`trip-empty-${day.day}`} muted>
                {t('trips.noOutfit')}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <Button
                testID={`trip-swap-${day.day}`}
                kind="secondary"
                icon="swap-horizontal"
                label={t('trips.swap')}
                disabled={busy !== null || weatherPending}
                onPress={() => void repick(index, day.activity)}
              />
              {day.outfitId ? (
                <AppText testID={`trip-planned-${day.day}`} variant="caption" muted>
                  {t('trips.inCalendar')}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}

      {hasOutfits ? (
        <Button
          testID="trip-calendar"
          icon="calendar-outline"
          label={t('trips.addToCalendar')}
          loading={busy === 'calendar'}
          disabled={busy !== null}
          onPress={() => void addToCalendar()}
        />
      ) : null}

      <View style={{ gap: spacing.md }}>
        <AppText variant="heading">{t('trips.packing')}</AppText>
        <AppText testID="trip-progress" muted>
          {t('trips.progress', { packed, total })}
        </AppText>
        {groups.map((group) => (
          <View key={group.category} style={{ gap: spacing.sm }}>
            <AppText variant="label" muted>
              {t(`taxonomy.category.${group.category}`)}
            </AppText>
            {group.entries.map(({ item, days }) => (
              <Check
                key={item.id}
                testID={`pack-${item.id}`}
                checked={packedIds.has(item.id)}
                label={item.name ?? t(`taxonomy.category.${item.category}`)}
                detail={
                  days.length > 0
                    ? t('trips.wornOn', { days: days.map(dayNumber).join(', ') })
                    : t('trips.extra')
                }
                onToggle={() =>
                  void change(() =>
                    tripRepository.setItemPacked(trip.id, item.id, !packedIds.has(item.id)),
                  )
                }
                onRemove={
                  outfitIds.has(item.id)
                    ? undefined
                    : () => void change(() => tripRepository.removeEntry(trip.id, item.id))
                }
              />
            ))}
          </View>
        ))}
        {texts.map((entry) => (
          <Check
            key={entry.key}
            testID={`pack-text-${entry.key}`}
            checked={entry.packed}
            label={entry.label ?? ''}
            onToggle={() =>
              void change(() => tripRepository.setTextPacked(trip.id, entry.key, !entry.packed))
            }
            onRemove={() => void change(() => tripRepository.removeEntry(trip.id, entry.key))}
          />
        ))}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field
              testID="pack-text-input"
              value={extraText}
              onChangeText={setExtraText}
              placeholder={t('trips.extraPlaceholder')}
            />
          </View>
          <Button
            testID="pack-text-add"
            kind="secondary"
            icon="add"
            label={t('trips.add')}
            disabled={!extraText.trim()}
            onPress={() => {
              const label = extraText;
              setExtraText('');
              void change(() => tripRepository.addText(trip.id, label));
            }}
          />
        </View>
        <Button
          testID="pack-item-toggle"
          kind="secondary"
          icon="shirt-outline"
          label={t(picking ? 'common.done' : 'trips.addFromCloset')}
          onPress={() => setPicking(!picking)}
        />
        {picking ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {addable.map((item) => (
              <Pressable
                key={item.id}
                testID={`pack-add-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={item.name ?? t(`taxonomy.category.${item.category}`)}
                onPress={() => void change(() => tripRepository.addItem(trip.id, item.id))}
              >
                <Image
                  source={{ uri: imageStore.uri(item.thumbPath) }}
                  contentFit="contain"
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surface,
                  }}
                />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <Button testID="trip-delete" kind="danger" label={t('trips.delete')} onPress={remove} />
    </Screen>
  );
}

export default function TripScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trip, isPending } = useQuery({
    queryKey: [TRIPS, 'one', id],
    queryFn: () => tripRepository.get(id),
  });
  if (isPending) return null;
  if (!trip) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="help-circle-outline"
          title={t('trips.title')}
          message={t('trips.notFound')}
        />
      </Screen>
    );
  }
  return <TripView trip={trip} />;
}
