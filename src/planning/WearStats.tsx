import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui';

import { fromDay } from './dates';
import { useWearStats } from './usePlanning';

/** How many times an item or an outfit was worn and when last. */
export function WearStats({ kind, id }: { kind: 'item' | 'outfit'; id: string }) {
  const { t, i18n } = useTranslation();
  const { data: stats } = useWearStats(kind, id);
  if (!stats) return null;
  return (
    <AppText testID="wear-stats" muted>
      {stats.count === 0 || !stats.lastWorn
        ? t('planning.neverWorn')
        : t('planning.wearStats', {
            count: stats.count,
            date: new Intl.DateTimeFormat(i18n.language, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(fromDay(stats.lastWorn)),
          })}
    </AppText>
  );
}
