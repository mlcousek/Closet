import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { useImportProgress } from './importActions';

const TAB_BAR_HEIGHT = 49;

/** A pill shown above the tab bar on every main section while a bulk import is running. */
export function ImportIndicator() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, radius, spacing } = useTheme();
  const progress = useImportProgress((state) => state.progress);
  if (progress.queued + progress.processing === 0) return null;
  return (
    <Pressable
      testID="import-indicator"
      accessibilityRole="button"
      onPress={() => router.push('/import')}
      style={[
        styles.pill,
        {
          bottom: insets.bottom + TAB_BAR_HEIGHT + 24,
          backgroundColor: colors.primary,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          gap: spacing.sm,
        },
      ]}
    >
      <Ionicons name="cloud-upload-outline" size={16} color={colors.onPrimary} />
      <AppText variant="label" style={{ color: colors.onPrimary }}>
        {t('closet.importRunning', { done: progress.done, total: progress.total })}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { position: 'absolute', left: 20, flexDirection: 'row', alignItems: 'center' },
});
