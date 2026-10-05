import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  DISPLAY_COLOURS,
  DISPLAY_RULES,
  displayState,
  getDisplayTheme,
  shiftAt,
} from '@/display/settings';
import { formatTemperature } from '@/i18n/format';
import { OutfitCollage } from '@/outfits/OutfitImage';
import { useOutfits, useRenderSummary } from '@/outfits/useOutfits';
import { toDay } from '@/planning/dates';
import { getTemperatureUnit } from '@/planning/settings';
import { useCalendar, useSuggestions, useWeather } from '@/planning/usePlanning';
import { conditionOf } from '@/planning/weather';
import { greetingKey } from '@/profile/greeting';
import { useProfile } from '@/profile/useProfile';
import { imageStore } from '@/storage/imageStore';

/**
 * A full-screen, always-on view for a phone on a stand or a wall: the time,
 * a welcome, the weather and what to wear today. It keeps the screen awake,
 * dims when left alone, and follows the calendar as today's outfit changes.
 */
export default function DisplayScreen() {
  useKeepAwake();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [touchedAt, setTouchedAt] = useState(() => Date.now());
  const [controls, setControls] = useState(false);
  const [theme] = useState(getDisplayTheme);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    displayState.open = true;
    return () => {
      displayState.open = false;
    };
  }, []);

  // A display left on a stand for days would otherwise show the weather of when it was opened.
  const client = useQueryClient();
  const hour = now.getHours();
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ['weather'] });
  }, [client, hour]);

  useEffect(() => {
    if (!controls) return;
    const timer = setTimeout(() => setControls(false), DISPLAY_RULES.controlsMs);
    return () => clearTimeout(timer);
  }, [controls, touchedAt]);

  const day = toDay(now);
  const { data: profile } = useProfile();
  const { data: weather } = useWeather();
  const { data: byDay } = useCalendar(day, day);
  const { data: outfits = [] } = useOutfits({});
  const summarise = useRenderSummary();
  const { suggestions } = useSuggestions(day);

  const colours = DISPLAY_COLOURS[theme];
  const landscape = width > height;
  const locale = i18n.language === 'cs' ? 'cs-CZ' : 'en-GB';
  const dimmed = !controls && now.getTime() - touchedAt >= DISPLAY_RULES.dimAfterMs;
  const shift = shiftAt(now);

  // What is planned or worn today comes first; without a plan, the best suggestion is shown.
  const entry = byDay?.get(day)?.[0];
  const planned = entry ? outfits.find((outfit) => outfit.id === entry.outfitId) : undefined;
  const suggestion = planned ? undefined : suggestions[0];
  const pieces = planned ? planned.entries.map((item) => item.item) : (suggestion?.items ?? []);
  const render = planned ? (summarise(planned).current?.imagePath ?? null) : null;
  const current = weather?.weather?.current ?? null;
  const unit = getTemperatureUnit();

  const outfitSize = landscape
    ? Math.min(height * 0.8, width * 0.4)
    : Math.min(width * 0.8, height * 0.45);

  return (
    <Pressable
      testID="display"
      accessibilityLabel={t('display.title')}
      onPress={() => {
        setTouchedAt(Date.now());
        setControls(true);
      }}
      style={{ flex: 1, backgroundColor: colours.background }}
    >
      <StatusBar hidden />
      <View
        testID={`display-layout-${landscape ? 'landscape' : 'portrait'}`}
        style={{
          flex: 1,
          flexDirection: landscape ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          padding: 32,
          transform: [{ translateX: shift.x }, { translateY: shift.y }],
        }}
      >
        <View style={{ alignItems: landscape ? 'flex-start' : 'center', gap: 8 }}>
          <Text
            testID="display-time"
            style={{ color: colours.text, fontSize: 88, fontWeight: '200' }}
          >
            {new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(now)}
          </Text>
          <Text testID="display-date" style={{ color: colours.muted, fontSize: 22 }}>
            {new Intl.DateTimeFormat(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(now)}
          </Text>
          {profile ? (
            <Text
              testID="display-welcome"
              style={{ color: colours.text, fontSize: 26, marginTop: 16 }}
            >
              {t(greetingKey(now), { name: profile.name })}
            </Text>
          ) : null}
          {current ? (
            <Text testID="display-weather" style={{ color: colours.muted, fontSize: 22 }}>
              {`${formatTemperature(current.temperature, unit, locale)} · ${t(`weather.condition.${conditionOf(current.code)}`)}`}
            </Text>
          ) : null}
        </View>

        <View style={{ alignItems: 'center', gap: 12 }}>
          {pieces.length > 0 ? (
            <>
              <View
                style={{
                  width: outfitSize * 0.75,
                  height: outfitSize,
                  borderRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: colours.panel,
                }}
              >
                {render ? (
                  <Image
                    testID="display-render"
                    source={{ uri: imageStore.uri(render) }}
                    contentFit="cover"
                    style={{ flex: 1 }}
                  />
                ) : (
                  <OutfitCollage testID="display-collage" items={pieces} />
                )}
              </View>
              <Text testID="display-outfit-label" style={{ color: colours.muted, fontSize: 18 }}>
                {planned ? (planned.name ?? t('display.todaysOutfit')) : t('display.suggestion')}
              </Text>
            </>
          ) : (
            <Text testID="display-no-outfit" style={{ color: colours.muted, fontSize: 18 }}>
              {t('display.noOutfit')}
            </Text>
          )}
        </View>
      </View>

      {dimmed ? (
        <View
          testID="display-dim"
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#000000',
            opacity: DISPLAY_RULES.dimOpacity,
          }}
        />
      ) : null}

      {controls ? (
        <Pressable
          testID="display-exit"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{
            position: 'absolute',
            top: 48,
            right: 24,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: colours.panel,
          }}
        >
          <Text style={{ color: colours.text, fontSize: 16, fontWeight: '500' }}>
            {t('display.exit')}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
