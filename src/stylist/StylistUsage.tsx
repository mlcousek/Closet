import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui';
import { usageLog } from '@/outfits/renders';

/** How many stylist requests were sent this month and in total, as each one is paid for. */
export function StylistUsage() {
  const { t } = useTranslation();
  const { data: counts } = useQuery({
    queryKey: ['ai-usage', 'stylist'],
    queryFn: () => usageLog.counts('stylist'),
  });
  if (!counts || counts.total === 0) return null;
  return (
    <AppText testID="stylist-usage" variant="caption" muted style={{ marginTop: 8 }}>
      {t('stylist.usage', { month: counts.month, total: counts.total })}
    </AppText>
  );
}
