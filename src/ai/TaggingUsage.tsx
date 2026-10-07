import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui';
import { usageLog } from '@/outfits/renders';

/** How many photos were sent for automatic details this month and in total, as each one is paid for. */
export function TaggingUsage() {
  const { t } = useTranslation();
  const { data: counts } = useQuery({
    queryKey: ['ai-usage', 'tag'],
    queryFn: () => usageLog.counts('tag'),
  });
  if (!counts || counts.total === 0) return null;
  return (
    <AppText testID="tagging-usage" variant="caption" muted style={{ marginTop: 8 }}>
      {t('ai.taggingUsage', { month: counts.month, total: counts.total })}
    </AppText>
  );
}
