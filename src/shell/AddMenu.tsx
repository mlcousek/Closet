import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { useAddActions } from './addActions';

const TAB_BAR_HEIGHT = 49;

/** Floating add button shown above the tab bar on the main sections. */
export function AddButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const openMenu = useAddActions((state) => state.openMenu);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('addMenu.open')}
      testID="add-button"
      onPress={openMenu}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: colors.primary,
          bottom: insets.bottom + TAB_BAR_HEIGHT + 16,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons name="add" size={28} color={colors.onPrimary} />
    </Pressable>
  );
}

/** Bottom sheet listing every registered creation action. */
export function AddMenu() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { actions, menuOpen, closeMenu } = useAddActions();

  return (
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={closeMenu}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            gap: spacing.sm,
          },
        ]}
      >
        <AppText variant="heading">{t('addMenu.title')}</AppText>
        {actions.length === 0 ? (
          <AppText muted>{t('addMenu.empty')}</AppText>
        ) : (
          actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              testID={`add-action-${action.id}`}
              onPress={() => {
                closeMenu();
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.action,
                { gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons name={action.icon} size={22} color={colors.text} />
              <AppText>{t(action.labelKey)}</AppText>
            </Pressable>
          ))
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  action: { flexDirection: 'row', alignItems: 'center' },
});
