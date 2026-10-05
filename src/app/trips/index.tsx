import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { parseDateInput } from '@/closet/itemFormLogic';
import { itemRepository } from '@/closet/repository';
import { AppText, Button, EmptyState, Field, Screen } from '@/components/ui';
import { fromDay, toDay, today } from '@/planning/dates';
import { searchPlaces, type Place } from '@/planning/weather';
import { useTheme } from '@/theme/useTheme';
import { generateTrip } from '@/trips/actions';
import { validateTrip, type TripError } from '@/trips/plan';
import { TRIPS, tripRepository } from '@/trips/repository';

/** The form for a new trip: a name, where to, and from when to when. */
function NewTrip({ onCreated }: { onCreated: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [problem, setProblem] = useState<TripError | 'dateInvalid' | 'searchFailed' | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setProblem(null);
    try {
      setResults(await searchPlaces(query, i18n.language));
    } catch {
      setProblem('searchFailed');
    }
  };

  const create = async () => {
    const startAt = parseDateInput(start);
    const endAt = parseDateInput(end);
    if (startAt === null || endAt === null) {
      setProblem('dateInvalid');
      return;
    }
    const startDay = toDay(new Date(startAt));
    const endDay = toDay(new Date(endAt));
    const error = validateTrip({ name, hasPlace: !!place, startDay, endDay, today: today() });
    setProblem(error);
    if (error || !place) return;
    setBusy(true);
    try {
      const trip = await tripRepository.create({ name, place, startDay, endDay });
      // The trip exists either way; outfits can be suggested again from its screen.
      await generateTrip(trip, await itemRepository.list({})).catch(() => {});
      onCreated(trip.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="trip-form" style={{ gap: spacing.md }}>
      <Field testID="trip-name" label={t('trips.name')} value={name} onChangeText={setName} />
      {place ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <AppText testID="trip-place" style={{ flex: 1 }}>
            {place.name}
          </AppText>
          <Button
            testID="trip-place-change"
            kind="secondary"
            label={t('trips.changePlace')}
            onPress={() => setPlace(null)}
          />
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                testID="trip-place-query"
                label={t('trips.destination')}
                value={query}
                onChangeText={setQuery}
              />
            </View>
            <Button
              testID="trip-place-search"
              kind="secondary"
              icon="search"
              label={t('weather.find')}
              disabled={query.trim().length < 2}
              onPress={() => void search()}
            />
          </View>
          {results?.length === 0 ? <AppText muted>{t('weather.noPlaces')}</AppText> : null}
          {results?.map((result, index) => (
            <Pressable
              key={`${result.latitude},${result.longitude}`}
              testID={`trip-place-result-${index}`}
              accessibilityRole="button"
              onPress={() => {
                setPlace(result);
                setResults(null);
                if (!name.trim()) setName(result.name.split(',')[0]);
              }}
              style={{ paddingVertical: spacing.sm }}
            >
              <AppText>{result.name}</AppText>
            </Pressable>
          ))}
        </>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            testID="trip-start"
            label={t('trips.from')}
            value={start}
            onChangeText={setStart}
            placeholder={t('itemForm.purchasedAtPlaceholder')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            testID="trip-end"
            label={t('trips.to')}
            value={end}
            onChangeText={setEnd}
            placeholder={t('itemForm.purchasedAtPlaceholder')}
          />
        </View>
      </View>
      {problem ? (
        <AppText testID="trip-problem" style={{ color: colors.danger }}>
          {t(`trips.errors.${problem}`)}
        </AppText>
      ) : null}
      <Button
        testID="trip-create"
        label={t('trips.create')}
        loading={busy}
        onPress={() => void create()}
      />
    </View>
  );
}

/** Trips, upcoming first, and the form for a new one. */
export default function TripsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const { colors, spacing, radius } = useTheme();
  const { data: trips, isPending } = useQuery({
    queryKey: [TRIPS, 'list'],
    queryFn: () => tripRepository.list(),
  });
  const [creating, setCreating] = useState(false);
  if (isPending) return null;

  const range = (from: string, to: string) => {
    const format = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
    return `${format.format(fromDay(from))} – ${format.format(fromDay(to))}`;
  };

  return (
    <Screen edges={[]} scroll style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
      {creating ? (
        <NewTrip
          onCreated={(id) => {
            setCreating(false);
            void client.invalidateQueries({ queryKey: [TRIPS] });
            router.push({ pathname: '/trips/[id]', params: { id } });
          }}
        />
      ) : (
        <Button
          testID="trip-new"
          icon="add"
          label={t('trips.new')}
          onPress={() => setCreating(true)}
        />
      )}
      {trips?.length === 0 && !creating ? (
        <EmptyState
          icon="airplane-outline"
          title={t('trips.emptyTitle')}
          message={t('trips.emptyMessage')}
        />
      ) : null}
      {trips?.map((trip) => (
        <Pressable
          key={trip.id}
          testID={`trip-${trip.id}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.xs,
            opacity: trip.endDay < today() ? 0.6 : 1,
          }}
        >
          <AppText variant="heading">{trip.name}</AppText>
          <AppText muted>{trip.place.name}</AppText>
          <AppText muted>{range(trip.startDay, trip.endDay)}</AppText>
        </Pressable>
      ))}
    </Screen>
  );
}
