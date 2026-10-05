import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { useToast } from './toast';

export function ToastHost() {
  const { toast, dismiss } = useToast();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          bottom: insets.bottom + 72,
          backgroundColor: colors.primary,
          borderRadius: radius.md,
          padding: spacing.lg,
          gap: spacing.md,
        },
      ]}
    >
      <AppText style={[styles.message, { color: colors.onPrimary }]}>{toast.message}</AppText>
      {toast.actionLabel && toast.onAction ? (
        <Pressable
          accessibilityRole="button"
          testID="toast-action"
          onPress={() => {
            toast.onAction?.();
            dismiss();
          }}
        >
          <AppText variant="label" style={[styles.action, { color: colors.onPrimary }]}>
            {toast.actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: { flex: 1 },
  action: { textDecorationLine: 'underline' },
});
