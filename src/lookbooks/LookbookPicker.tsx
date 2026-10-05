import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Field } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { lookbookRepository } from './repository';
import { useInvalidateLookbooks, useLookbooks } from './useLookbooks';

/**
 * A sheet for putting outfits into lookbooks. With one outfit it shows which
 * lookbooks already contain it and toggles membership; with several it adds
 * them all to the lookbook that is tapped. A new lookbook can be made in place.
 */
export function LookbookPicker({
  outfitIds,
  containing = [],
  onClose,
}: {
  outfitIds: string[];
  /** Lookbooks that already contain the outfit, when there is exactly one. */
  containing?: string[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: lookbooks = [] } = useLookbooks();
  const invalidate = useInvalidateLookbooks();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>(containing);
  const single = outfitIds.length === 1;

  const toggle = async (lookbookId: string) => {
    if (single && members.includes(lookbookId)) {
      await lookbookRepository.removeOutfit(lookbookId, outfitIds[0]);
      setMembers(members.filter((id) => id !== lookbookId));
    } else {
      await lookbookRepository.addOutfits(lookbookId, outfitIds);
      setMembers([...members, lookbookId]);
    }
    await invalidate();
    if (!single) onClose();
  };

  const create = async () => {
    const created = await lookbookRepository.create(name);
    setName('');
    await toggle(created.id);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={[styles.fill, { backgroundColor: colors.overlay }]}
        onPress={onClose}
      />
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
        <AppText variant="heading">{t('lookbooks.addTo')}</AppText>
        {lookbooks.map((lookbook) => {
          const selected = members.includes(lookbook.id);
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
              value={name}
              onChangeText={setName}
              placeholder={t('lookbooks.newPlaceholder')}
            />
          </View>
          <Button
            testID="new-lookbook-create"
            label={t('lookbooks.create')}
            disabled={!name.trim()}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
