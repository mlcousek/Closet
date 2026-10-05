import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen } from '@/components/ui';
import { greetingKey } from '@/profile/greeting';
import { useProfile } from '@/profile/useProfile';
import { useAddActions } from '@/shell/addActions';
import { useTheme } from '@/theme/useTheme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { data: profile } = useProfile();
  const openMenu = useAddActions((state) => state.openMenu);
  return (
    <Screen>
      <AppText variant="title" testID="greeting" style={{ marginTop: spacing.lg }}>
        {profile ? t(greetingKey(), { name: profile.name }) : t('tabs.home')}
      </AppText>
      <EmptyState
        icon="sparkles-outline"
        title={t('empty.home.title')}
        message={t('empty.home.message')}
        actionLabel={t('empty.home.action')}
        onAction={openMenu}
      />
    </Screen>
  );
}
