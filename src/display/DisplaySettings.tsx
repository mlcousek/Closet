import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Chips } from '@/closet/Chips';
import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import {
  DISPLAY_THEMES,
  getDisplayTheme,
  getStartWhileCharging,
  setDisplayTheme,
  setStartWhileCharging,
  type DisplayTheme,
} from './settings';

/** Settings of the wall display: its theme and whether it starts on the charger. */
export function DisplaySettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const [theme, setTheme] = useState<DisplayTheme>(getDisplayTheme);
  const [charging, setCharging] = useState(getStartWhileCharging);

  return (
    <View testID="display-settings" style={{ gap: spacing.md }}>
      <AppText variant="label" muted>
        {t('display.title')}
      </AppText>
      <Chips
        testIDPrefix="display-theme"
        options={DISPLAY_THEMES.map((value) => ({ value, label: t(`display.theme.${value}`) }))}
        selected={[theme]}
        onToggle={(value) => {
          setDisplayTheme(value);
          setTheme(value);
        }}
      />
      <Chips
        testIDPrefix="display-charging"
        options={[{ value: 'on', label: t('display.startWhileCharging') }]}
        selected={charging ? ['on'] : []}
        onToggle={() => {
          setStartWhileCharging(!charging);
          setCharging(!charging);
        }}
      />
      <AppText variant="caption" muted>
        {t('display.chargingNote')}
      </AppText>
      <Button
        testID="display-open"
        kind="secondary"
        icon="tv-outline"
        label={t('display.open')}
        onPress={() => router.push('/display')}
      />
    </View>
  );
}
