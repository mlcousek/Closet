import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { typography } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = keyof typeof typography;

export function AppText({
  variant = 'body',
  muted,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <RNText
      {...rest}
      style={[typography[variant], { color: muted ? colors.textMuted : colors.text }, style]}
    />
  );
}

export function Screen({
  children,
  scroll,
  style,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
}) {
  const { colors, spacing } = useTheme();
  const padding = { paddingHorizontal: spacing.lg };
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[padding, { paddingBottom: spacing.xxl }, style]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const background =
    kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : colors.surfaceAlt;
  const foreground = kind === 'secondary' ? colors.text : colors.onPrimary;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.xl,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
          <AppText variant="label" style={{ color: foreground }}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.empty, { gap: spacing.md, padding: spacing.xl }]}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      <AppText muted style={styles.center}>
        {message}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function Row({
  label,
  value,
  icon,
  onPress,
  testID,
}: {
  label: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  const content = (
    <View
      style={[
        styles.row,
        { paddingVertical: spacing.md, borderBottomColor: colors.border, gap: spacing.md },
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={colors.text} /> : null}
      <AppText style={styles.fill}>{label}</AppText>
      {value ? <AppText muted>{value}</AppText> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" testID={testID} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
});
