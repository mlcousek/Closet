import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, Row, Screen } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  return (
    <Screen scroll>
      <AppText variant="title" style={{ marginVertical: spacing.lg }}>
        {t('profile.title')}
      </AppText>
      <Row
        testID="open-settings"
        icon="settings-outline"
        label={t('profile.settings')}
        onPress={() => router.push('/settings')}
      />
    </Screen>
  );
}
