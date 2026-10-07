import { Image } from 'expo-image';
import { getLocales } from 'expo-localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { itemImageDeps } from '@/closet/deviceImages';
import { ItemForm } from '@/closet/ItemForm';
import { parsePriceInput } from '@/closet/itemFormLogic';
import { removeItemImages, storeItemImages } from '@/closet/itemImages';
import { parseWebUrl } from '@/closet/productPage';
import { itemRepository } from '@/closet/repository';
import { displayPath, type Item, type ItemDetails } from '@/closet/types';
import { useInvalidateItems, useItem } from '@/closet/useItems';
import { AppText, Button, EmptyState, Field, Row, Screen } from '@/components/ui';
import { formatCurrency, formatDate, formatLocale } from '@/i18n/format';
import { outfitRepository } from '@/outfits/repository';
import { useInvalidateOutfits } from '@/outfits/useOutfits';
import { WearStats } from '@/planning/WearStats';
import { CostPerWear } from '@/stats/CostPerWear';
import { pickPhoto } from '@/profile/photo';
import { attempt, deleteWithUndo, useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

function ItemView({ item }: { item: Item }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const invalidateItems = useInvalidateItems();
  const invalidateOutfits = useInvalidateOutfits();
  const showToast = useToast((state) => state.show);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boughtPrice, setBoughtPrice] = useState(item.price !== null ? String(item.price) : '');

  const locale = formatLocale(i18n.language === 'cs' ? 'cs' : 'en', getLocales()[0]?.regionCode);
  // Only web links are ever opened, whatever ended up stored.
  const sourceUrl = item.sourceUrl ? parseWebUrl(item.sourceUrl) : null;
  const list = (values: string[]) => (values.length > 0 ? values.join(', ') : t('common.notSet'));

  const save = async (details: ItemDetails) => {
    setBusy(true);
    try {
      await itemRepository.update(item.id, { ...details, needsReview: false });
      await invalidateItems();
      setEditing(false);
    } catch {
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
    }
  };

  const replaceImage = async () => {
    const result = await pickPhoto('library');
    if (result.status !== 'picked') return;
    setBusy(true);
    try {
      // As for a new item: the cutout and the stored original both come from the reduced photo.
      const photo = await itemImageDeps.reduce(result.photo);
      const cutout = await itemImageDeps.cutout(photo.uri);
      const images = await storeItemImages(
        { originalUri: photo.uri, cutoutUri: cutout?.uri ?? null },
        itemImageDeps,
      );
      await itemRepository.update(item.id, images);
      // The old files go only after the item points at the new ones.
      await removeItemImages(item, itemImageDeps);
      await invalidateItems();
    } catch {
      showToast({ message: t('common.somethingWentWrong') });
    } finally {
      setBusy(false);
    }
  };

  const markBought = async () => {
    const price = boughtPrice.trim() ? parsePriceInput(boughtPrice) : null;
    if (boughtPrice.trim() && price === null) {
      showToast({ message: t('itemForm.priceInvalid') });
      return;
    }
    await itemRepository.markBought(item.id, {
      price,
      currency: price !== null ? (item.currency ?? getLocales()[0]?.currencyCode ?? null) : null,
      purchasedAt: Date.now(),
    });
    await invalidateItems();
    await invalidateOutfits();
    showToast({ message: t('wishlist.boughtToast') });
  };

  const toggleArchive = async () => {
    if (item.ownership === 'archived') await itemRepository.unarchive([item.id]);
    else await itemRepository.archive([item.id]);
    await invalidateItems();
  };

  const remove = async () => {
    // Deleting an item also takes it out of the outfits that use it, so say how many.
    const used = await outfitRepository.countUsing([item.id]);
    const message =
      used > 0
        ? `${t('item.deleteMessage')} ${t('item.deleteUsedMessage', { count: used })}`
        : t('item.deleteMessage');
    Alert.alert(t('item.deleteTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          router.back();
          void deleteWithUndo({
            remove: () => itemRepository.remove([item.id]),
            restore: () => itemRepository.restore([item.id]),
            message: t('item.deletedToast'),
            undoLabel: t('common.undo'),
            onChange: () => {
              void invalidateItems();
              void invalidateOutfits();
            },
          });
        },
      },
    ]);
  };

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <Image
        testID="item-image"
        source={{ uri: imageStore.uri(displayPath(item)) }}
        contentFit="contain"
        style={{ height: 320, borderRadius: radius.md, backgroundColor: colors.surface }}
      />

      {editing ? (
        <ItemForm
          initial={item}
          submitLabel={t('common.save')}
          busy={busy}
          onSubmit={(details) => void save(details)}
          footer={
            <Button
              testID="item-edit-cancel"
              kind="secondary"
              label={t('common.cancel')}
              onPress={() => setEditing(false)}
            />
          }
        />
      ) : (
        <>
          <View style={{ gap: spacing.xs }}>
            <AppText variant="heading" testID="item-title">
              {item.name ?? t(`taxonomy.category.${item.category}`)}
            </AppText>
            {item.brand ? <AppText muted>{item.brand}</AppText> : null}
            {item.ownership === 'wishlist' ? (
              <AppText testID="item-wishlist" variant="label" muted>
                {t('wishlist.badge')}
              </AppText>
            ) : null}
            {item.ownership === 'archived' ? (
              <AppText testID="item-archived" variant="label" style={{ color: colors.danger }}>
                {t('item.archivedBadge')}
              </AppText>
            ) : null}
          </View>

          <View>
            <Row
              label={t('itemForm.category')}
              value={[
                t(`taxonomy.category.${item.category}`),
                item.subcategory ? t(`taxonomy.subcategory.${item.subcategory}`) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <Row
              label={t('itemForm.colours')}
              value={list(item.colours.map((colour) => t(`taxonomy.colour.${colour}`)))}
            />
            <Row
              label={t('itemForm.seasons')}
              value={list(item.seasons.map((season) => t(`taxonomy.season.${season}`)))}
            />
            <Row
              label={t('itemForm.occasions')}
              value={list(item.occasions.map((occasion) => t(`taxonomy.occasion.${occasion}`)))}
            />
            <Row
              label={t('itemForm.warmth')}
              value={item.warmth ? t(`taxonomy.warmth.${item.warmth}`) : t('common.notSet')}
            />
            <Row label={t('itemForm.size')} value={item.size ?? t('common.notSet')} />
            <Row
              label={t('itemForm.price')}
              value={
                item.price !== null
                  ? item.currency
                    ? formatCurrency(item.price, item.currency, locale)
                    : String(item.price)
                  : t('common.notSet')
              }
            />
            <Row
              label={t('itemForm.purchasedAt')}
              value={
                item.purchasedAt
                  ? formatDate(new Date(item.purchasedAt), locale)
                  : t('common.notSet')
              }
            />
            {item.notes ? <Row label={t('itemForm.notes')} value={item.notes} /> : null}
          </View>

          <WearStats kind="item" id={item.id} />
          {item.ownership === 'owned' ? <CostPerWear item={item} /> : null}
          <AppText variant="caption" muted>
            {t('item.added', { date: formatDate(new Date(item.createdAt), locale) })}
          </AppText>

          <View style={{ gap: spacing.sm }}>
            <Button
              testID="item-edit"
              icon="create-outline"
              label={t('item.edit')}
              onPress={() => setEditing(true)}
            />
            <Button
              testID="item-create-outfit"
              kind="secondary"
              icon="albums-outline"
              label={t('outfits.createFromItem')}
              onPress={() => router.push({ pathname: '/outfit/edit', params: { itemId: item.id } })}
            />
            {item.ownership !== 'archived' ? (
              <Button
                testID="item-style-this"
                kind="secondary"
                icon="sparkles-outline"
                label={t('stylist.styleThis')}
                onPress={() => router.push({ pathname: '/stylist', params: { itemId: item.id } })}
              />
            ) : null}
            <Button
              testID="item-replace-image"
              kind="secondary"
              icon="image-outline"
              label={t('item.replaceImage')}
              loading={busy}
              onPress={() => void replaceImage()}
            />
            {sourceUrl ? (
              <Button
                testID="item-open-source"
                kind="secondary"
                icon="open-outline"
                label={t('item.openSource')}
                onPress={() => void Linking.openURL(sourceUrl)}
              />
            ) : null}
            {item.ownership === 'wishlist' ? (
              <View
                testID="item-bought-panel"
                style={{ gap: spacing.sm, flexDirection: 'row', alignItems: 'flex-end' }}
              >
                <View style={{ flex: 1 }}>
                  <Field
                    testID="item-bought-price"
                    label={t('wishlist.pricePaid')}
                    value={boughtPrice}
                    onChangeText={setBoughtPrice}
                    keyboardType="decimal-pad"
                  />
                </View>
                <Button
                  testID="item-bought"
                  icon="bag-check-outline"
                  label={t('wishlist.bought')}
                  onPress={() => attempt(() => markBought(), t('common.somethingWentWrong'))}
                />
              </View>
            ) : null}
            {item.ownership === 'wishlist' ? null : (
              <Button
                testID="item-archive"
                kind="secondary"
                icon="archive-outline"
                label={t(item.ownership === 'archived' ? 'item.unarchive' : 'item.archive')}
                onPress={() => attempt(() => toggleArchive(), t('common.somethingWentWrong'))}
              />
            )}
            <Button
              testID="item-delete"
              kind="danger"
              icon="trash-outline"
              label={t('item.delete')}
              onPress={() => void remove()}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

export default function ItemScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: item, isPending } = useItem(id);
  if (isPending) return null;
  if (!item) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="help-circle-outline"
          title={t('item.title')}
          message={t('item.notFound')}
        />
      </Screen>
    );
  }
  return <ItemView key={`${item.id}:${item.price}`} item={item} />;
}
