import { useTranslation } from 'react-i18next';

import { AppText, EmptyState, Screen, type IconName } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { useAddActions } from './addActions';

type Section = 'home' | 'closet' | 'outfits' | 'calendar';

/** A main section before its feature exists: title, explanation and a call to action. */
export function SectionPlaceholder({ section, icon }: { section: Section; icon: IconName }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const openMenu = useAddActions((state) => state.openMenu);
  return (
    <Screen>
      <AppText variant="title" style={{ marginTop: spacing.lg }}>
        {t(`tabs.${section}`)}
      </AppText>
      <EmptyState
        icon={icon}
        title={t(`empty.${section}.title`)}
        message={t(`empty.${section}.message`)}
        actionLabel={t(`empty.${section}.action`)}
        onAction={openMenu}
      />
    </Screen>
  );
}
