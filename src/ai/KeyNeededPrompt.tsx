import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import type { ProviderId } from './providers';

/** Shown in place of an AI feature when its provider has no key. */
export function KeyNeededPrompt({ provider }: { provider: ProviderId }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <AppText variant="heading">{t('ai.keyNeededTitle')}</AppText>
      <AppText muted>
        {t('ai.keyNeededMessage', { provider: t(`ai.providers.${provider}.name`) })}
      </AppText>
      <Button
        label={t('ai.openKeySettings')}
        icon="key-outline"
        onPress={() => router.push('/settings/ai-keys')}
      />
    </View>
  );
}
