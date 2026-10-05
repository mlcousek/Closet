import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';

import type { Item } from '@/closet/types';
import { AppText } from '@/components/ui';
import { formatCurrency, formatLocale, formatNumber } from '@/i18n/format';
import { useWearStats } from '@/planning/usePlanning';

import { costPerWear } from './stats';

export function formatMoney(value: number, currency: string | null, locale: string): string {
  try {
    return currency ? formatCurrency(value, currency, locale) : formatNumber(value, locale);
  } catch {
    // An unknown currency code makes Intl throw; the number alone is still useful.
    return formatNumber(value, locale);
  }
}

/** What each wear of an owned item has cost so far. Nothing is shown for an item without a price. */
export function CostPerWear({ item }: { item: Pick<Item, 'id' | 'price' | 'currency'> }) {
  const { t, i18n } = useTranslation();
  const { data: stats } = useWearStats('item', item.id);
  if (item.price === null || item.price <= 0 || !stats) return null;
  const cost = costPerWear(item.price, stats.count);
  const locale = formatLocale(i18n.language === 'cs' ? 'cs' : 'en', getLocales()[0]?.regionCode);
  return (
    <AppText testID="cost-per-wear" muted>
      {cost === null
        ? t('stats.costPerWearUnworn')
        : t('stats.costPerWearValue', { cost: formatMoney(cost, item.currency, locale) })}
    </AppText>
  );
}
