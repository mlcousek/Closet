import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/closet/Chips';
import { AppText, Button, Field } from '@/components/ui';
import type { TemperatureUnit } from '@/i18n/format';
import { useTheme } from '@/theme/useTheme';

import { formatTime, parseTime, setReminder } from './reminder';
import {
  getChosenCity,
  getReminderTime,
  getTemperatureUnit,
  setChosenCity,
  setTemperatureUnit,
} from './settings';
import { useInvalidateWeather } from './usePlanning';
import { searchPlaces, type Place } from './weather';

/** Settings for the weather (city, units) and the daily reminder. */
export function PlanningSettings() {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const invalidateWeather = useInvalidateWeather();
  const [city, setCity] = useState<Place | null>(getChosenCity);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [unit, setUnit] = useState<TemperatureUnit>(getTemperatureUnit);
  const [time, setTime] = useState(() => {
    const stored = getReminderTime();
    return stored ? formatTime(stored) : '';
  });
  const [reminderOn, setReminderOn] = useState(() => getReminderTime() !== null);
  // The time that is really scheduled, as opposed to what is being typed.
  const [scheduled, setScheduled] = useState(time);
  const [notice, setNotice] = useState<'searchFailed' | 'timeInvalid' | 'denied' | null>(null);

  const chooseCity = async (place: Place | null) => {
    setChosenCity(place);
    setCity(place);
    setResults(null);
    setQuery('');
    await invalidateWeather();
  };

  const search = async () => {
    setNotice(null);
    try {
      setResults(await searchPlaces(query, i18n.language));
    } catch {
      setNotice('searchFailed');
    }
  };

  const text = { title: t('reminder.title'), body: t('reminder.body') };

  const turnOn = async () => {
    const parsed = parseTime(time);
    if (!parsed) {
      setNotice('timeInvalid');
      return;
    }
    const allowed = await setReminder(parsed, text);
    setReminderOn(allowed);
    if (allowed) {
      setScheduled(formatTime(parsed));
      setTime(formatTime(parsed));
    }
    setNotice(allowed ? null : 'denied');
  };

  const turnOff = async () => {
    await setReminder(null, text);
    setReminderOn(false);
    setNotice(null);
  };

  return (
    <View testID="planning-settings" style={{ gap: spacing.md }}>
      <AppText variant="label" muted>
        {t('weather.title')}
      </AppText>
      <AppText testID="weather-city">{city ? city.name : t('weather.usingLocation')}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            testID="city-search"
            label={t('weather.citySearch')}
            value={query}
            onChangeText={setQuery}
          />
        </View>
        <Button
          testID="city-search-go"
          kind="secondary"
          label={t('weather.find')}
          disabled={query.trim().length < 2}
          onPress={() => void search()}
        />
      </View>
      {results?.length === 0 ? <AppText muted>{t('weather.noPlaces')}</AppText> : null}
      {results?.map((place, index) => (
        <Pressable
          key={`${place.latitude},${place.longitude}`}
          testID={`city-result-${index}`}
          accessibilityRole="button"
          onPress={() => void chooseCity(place)}
          style={{
            padding: spacing.md,
            borderRadius: radius.sm,
            backgroundColor: colors.surfaceAlt,
          }}
        >
          <AppText>{place.name}</AppText>
        </Pressable>
      ))}
      {city ? (
        <Button
          testID="city-clear"
          kind="secondary"
          label={t('weather.useLocation')}
          onPress={() => void chooseCity(null)}
        />
      ) : null}
      <Chips
        testIDPrefix="unit"
        options={[
          { value: 'celsius' as const, label: '°C' },
          { value: 'fahrenheit' as const, label: '°F' },
        ]}
        selected={[unit]}
        onToggle={(value) => {
          setTemperatureUnit(value);
          setUnit(value);
          void invalidateWeather();
        }}
      />

      <AppText variant="label" muted style={{ marginTop: spacing.md }}>
        {t('reminder.settingsTitle')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            testID="reminder-time"
            label={t('reminder.time')}
            value={time}
            onChangeText={setTime}
            placeholder="7:30"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <Button
          testID="reminder-toggle"
          kind={reminderOn ? 'secondary' : 'primary'}
          label={t(reminderOn ? 'reminder.turnOff' : 'reminder.turnOn')}
          onPress={() => void (reminderOn ? turnOff() : turnOn())}
        />
      </View>
      {reminderOn && time.trim() !== scheduled ? (
        <Button
          testID="reminder-update"
          label={t('reminder.update')}
          onPress={() => void turnOn()}
        />
      ) : null}
      {reminderOn ? (
        <AppText testID="reminder-on" muted>
          {t('reminder.onAt', { time: scheduled })}
        </AppText>
      ) : null}
      {notice === 'timeInvalid' ? (
        <AppText testID="planning-notice" style={{ color: colors.danger }}>
          {t('reminder.timeInvalid')}
        </AppText>
      ) : null}
      {notice === 'searchFailed' ? (
        <AppText testID="planning-notice" style={{ color: colors.danger }}>
          {t('weather.searchFailed')}
        </AppText>
      ) : null}
      {notice === 'denied' ? (
        <View testID="reminder-denied" style={{ gap: spacing.sm }}>
          <AppText>{t('reminder.denied')}</AppText>
          <Button
            kind="secondary"
            label={t('avatar.openSystemSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
    </View>
  );
}
