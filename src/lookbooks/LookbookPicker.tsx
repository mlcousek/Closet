import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Field } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { lookbookRepository } from './repository';
import { useInvalidateLookbooks, useLookbooks, useLookbooksContaining } from './useLookbooks';

/**
 * A sheet for putting outfits into lookbooks.
 * - One outfit: shows which lookbooks contain it and toggles membership.
 * - Several outfits: adds them all to the lookbook that is tapped, then closes.
 * - No outfits: only creates a new, empty lookbook.
 * A new lookbook can always be made in place.
 */
export function LookbookPicker({
  outfitIds,
  onClose,
}: {
  outfitIds: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: lookbooks = [] } = useLookbooks();
  const invalidate = useInvalidateLookbooks();
  const single = outfitIds.length === 1;
  const creatingOnly = outfitIds.length === 0;
  // Membership is read from the database, so it is right however the sheet was opened.
  const { data: members = [] } = useLookbooksContaining(single ? outfitIds[0] : undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (action: () => Promise<unknown>, closeAfter: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await invalidate();
    } finally {
      setBusy(false);
    }
    if (closeAfter) onClose();
  };

  const toggle = (lookbookId: string) =>
    act(
      () =>
        single && members.includes(lookbookId)
          ? lookbookRepository.removeOutfit(lookbookId, outfitIds[0])
          : lookbookRepository.addOutfits(lookbookId, outfitIds),
      !single,
    );

  const create = () =>
    act(async () => {
      const created = await lookbookRepository.create(name);
      setName('');
      await lookbookRepository.addOutfits(created.id, outfitIds);
    }, !single);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={[styles.fill, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
      {/* The name field sits at the bottom edge, exactly where the keyboard opens. */}
      <KeyboardAvoidingView behavior="padding">
        <View
          testID="lookbook-picker"
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            gap: spacing.md,
          }}
        >
          <AppText variant="heading">
            {t(creatingOnly ? 'lookbooks.add' : 'lookbooks.addTo')}
          </AppText>
          {creatingOnly
            ? null
            : lookbooks.map((lookbook) => {
                const selected = single && members.includes(lookbook.id);
                return (
                  <Pressable
                    key={lookbook.id}
                    testID={`pick-lookbook-${lookbook.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => void toggle(lookbook.id)}
                    style={[styles.row, { gap: spacing.md, paddingVertical: spacing.sm }]}
                  >
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={colors.text}
                    />
                    <AppText style={styles.fill}>{lookbook.name}</AppText>
                    <AppText muted>{lookbook.outfitIds.length}</AppText>
                  </Pressable>
                );
              })}
          <View style={[styles.row, { gap: spacing.sm, alignItems: 'flex-end' }]}>
            <View style={styles.fill}>
              <Field
                testID="new-lookbook-name"
                label={t('lookbooks.newPlaceholder')}
                value={name}
                onChangeText={setName}
              />
            </View>
            <Button
              testID="new-lookbook-create"
              label={t('lookbooks.create')}
              disabled={!name.trim() || busy}
              onPress={() => void create()}
            />
          </View>
          {single ? (
            <Button
              testID="lookbook-picker-done"
              kind="secondary"
              label={t('common.done')}
              onPress={onClose}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
