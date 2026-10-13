import { createElement } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

import type { DateFieldProps } from './DateField.types';
import { AppText, Button } from './ui';

/** Browser calendar control; native bundles resolve DateField.tsx instead. */
export function DateField({ label, value, onChange, testID, clearable, disabled }: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius, dark } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      {createElement('input', {
        type: 'date',
        value,
        disabled,
        lang: i18n.language,
        'aria-label': label,
        'data-testid': testID,
        onChange: (event: { currentTarget: { value: string } }) =>
          onChange(event.currentTarget.value),
        style: {
          color: colors.text,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.sm,
          padding: spacing.md,
          fontSize: 16,
          minHeight: 44,
          minWidth: 0,
          boxSizing: 'border-box',
          colorScheme: dark ? 'dark' : 'light',
        },
      })}
      {clearable && value ? (
        <Button
          testID={`${testID}-clear`}
          label={t('common.clear')}
          kind="secondary"
          disabled={disabled}
          onPress={() => onChange('')}
        />
      ) : null}
    </View>
  );
}
