import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ItemForm } from '@/closet/ItemForm';
import { itemRepository } from '@/closet/repository';
import { displayPath, type ItemDetails } from '@/closet/types';
import { useInvalidateItems, useItems } from '@/closet/useItems';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { deleteWithUndo } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

/** Steps through imported items one at a time so the user can confirm, edit or discard each. */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const invalidateItems = useInvalidateItems();
  const { data: pending = [], isPending } = useItems({ needsReview: true, sort: 'newest' });
  const [busy, setBusy] = useState(false);
  // Counts items handled in this visit, so progress only moves forward even if more arrive meanwhile.
  const [handled, setHandled] = useState(0);

  if (isPending) return null;

  // Oldest first, in the order the photos were chosen.
  const item = pending[pending.length - 1];
  if (!item) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="checkmark-circle-outline"
          title={t('importFlow.reviewTitle')}
          message={t('importFlow.reviewDone')}
          actionLabel={t('common.done')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const current = handled + 1;
  const total = handled + pending.length;
  // An item imported without suggestions has only a placeholder category, which is not a suggestion.
  const hasSuggestions = item.name !== null || item.colours.length > 0;

  const confirm = async (details: ItemDetails) => {
    setBusy(true);
    try {
      await itemRepository.update(item.id, { ...details, needsReview: false });
      setHandled((count) => count + 1);
      await invalidateItems();
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setHandled((count) => count + 1);
    return deleteWithUndo({
      remove: () => itemRepository.remove([item.id]),
      restore: () => itemRepository.restore([item.id]),
      message: t('common.deleted'),
      undoLabel: t('common.undo'),
      onChange: () => void invalidateItems(),
    });
  };

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <AppText testID="review-progress" muted>
        {t('importFlow.reviewProgress', { current, total })}
      </AppText>
      <Image
        testID="review-image"
        source={{ uri: imageStore.uri(displayPath(item)) }}
        contentFit="contain"
        style={{ height: 260, borderRadius: radius.md, backgroundColor: colors.surface }}
      />
      <ItemForm
        // Each item gets a fresh form.
        key={item.id}
        initial={item}
        suggested={
          hasSuggestions
            ? ['name', 'category', 'subcategory', 'colours', 'seasons', 'occasions', 'warmth']
            : []
        }
        submitLabel={t('importFlow.confirm')}
        busy={busy}
        onSubmit={(details) => void confirm(details)}
        footer={
          <Button
            testID="review-discard"
            kind="danger"
            label={t('importFlow.discard')}
            onPress={() => void discard()}
          />
        }
      />
    </Screen>
  );
}
