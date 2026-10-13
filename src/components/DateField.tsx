import DateTimePicker from '@react-native-community/datetimepicker';
import { getLocales } from 'expo-localization';
import { useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDate, formatLocale } from '@/i18n/format';
import { fromDay, toDay, today } from '@/planning/dates';
import { useTheme } from '@/theme/useTheme';

import type { DateFieldProps } from './DateField.types';
import { AppText, Button } from './ui';

/** The picker edits a draft; cancelling never changes the form's saved day. */
export function DateField({ label, value, onChange, testID, clearable, disabled }: DateFieldProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing, radius, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(today);
  const locale = formatLocale(
    i18n.language.startsWith('cs') ? 'cs' : 'en',
    getLocales()[0]?.regionCode,
  );
  const close = () => setOpen(false);
  const picker = (
    <DateTimePicker
      testID={`${testID}-picker`}
      value={fromDay(draft)}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      locale={Platform.OS === 'ios' ? locale : undefined}
      themeVariant={dark ? 'dark' : 'light'}
      onDismiss={close}
      onValueChange={(_, date) => {
        const day = toDay(date);
        setDraft(day);
        if (Platform.OS === 'android') {
          close();
          onChange(day);
        }
      }}
    />
  );
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" muted>
        {label}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{
          text: value ? formatDate(fromDay(value), locale, 'short') : t('common.notSet'),
        }}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => {
          Keyboard.dismiss();
          setDraft(value || today());
          setOpen(true);
        }}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.sm,
          padding: spacing.md,
          minHeight: 44,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <AppText muted={!value}>
          {value ? formatDate(fromDay(value), locale, 'short') : t('common.select')}
        </AppText>
      </Pressable>
      {clearable && value ? (
        <Button
          testID={`${testID}-clear`}
          label={t('common.clear')}
          kind="secondary"
          disabled={disabled}
          onPress={() => onChange('')}
        />
      ) : null}
      {open && Platform.OS === 'android' ? picker : null}
      {open && Platform.OS !== 'android' ? (
        <Modal transparent animationType="slide" onRequestClose={close}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
            <SafeAreaView
              edges={['bottom']}
              style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.lg,
                borderTopRightRadius: radius.lg,
              }}
            >
              <View accessibilityViewIsModal style={{ padding: spacing.lg, gap: spacing.md }}>
                <AppText variant="heading">{label}</AppText>
                {picker}
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}
                >
                  <Button
                    testID={`${testID}-cancel`}
                    label={t('common.cancel')}
                    kind="secondary"
                    onPress={close}
                  />
                  <Button
                    testID={`${testID}-done`}
                    label={t('common.done')}
                    onPress={() => {
                      close();
                      onChange(draft);
                    }}
                  />
                </View>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
