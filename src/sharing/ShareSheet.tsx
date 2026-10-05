import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Linking, Modal, ScrollView, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips } from '@/closet/Chips';
import type { Item } from '@/closet/types';
import { AppText, Button } from '@/components/ui';
import { OutfitCollage } from '@/outfits/OutfitImage';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

import {
  FORMAT_RATIO,
  SHARE_FORMATS,
  availableContents,
  captureCard,
  saveImage,
  shareImage,
  sheetColumns,
  type ShareContent,
  type ShareFormat,
} from './share';

const PREVIEW_WIDTH = 260;
/** Shared images are always light, whatever the app's appearance, so they look the same everywhere. */
const CARD = { background: '#FFFFFF', text: '#1B1622', muted: '#6D6478' };

export type ShareOutfit = {
  id: string;
  name: string | null;
  items: Pick<Item, 'id' | 'thumbPath' | 'name' | 'brand'>[];
  /** Relative path of the try-on render, when there is one. */
  renderPath: string | null;
};

function OutfitPicture({ outfit, content }: { outfit: ShareOutfit; content: ShareContent }) {
  return content === 'render' && outfit.renderPath ? (
    <Image
      testID="share-render"
      source={{ uri: imageStore.uri(outfit.renderPath) }}
      contentFit="contain"
      style={{ flex: 1 }}
    />
  ) : (
    <OutfitCollage items={outfit.items} testID="share-collage" />
  );
}

/**
 * Preview and options for sharing one outfit, or a page of a lookbook, as an
 * image. The preview is the thing that gets captured, so what is seen is what
 * is shared.
 */
export function ShareSheet({
  title,
  outfits,
  onClose,
}: {
  /** Shown on the image: the outfit's name, or the lookbook's name for a contact sheet. */
  title: string | null;
  /** One outfit for a single share, several for a contact sheet. */
  outfits: ShareOutfit[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const card = useRef<View>(null);
  const single = outfits.length === 1;
  const contents = availableContents(
    single ? outfits[0].renderPath !== null : outfits.some((outfit) => outfit.renderPath !== null),
  );
  const [content, setContent] = useState<ShareContent>(contents[0]);
  const [format, setFormat] = useState<ShareFormat>('portrait');
  const [withItems, setWithItems] = useState(false);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [notice, setNotice] = useState<'saved' | 'denied' | 'failed' | null>(null);

  const run = async (action: 'share' | 'save') => {
    setBusy(action);
    setNotice(null);
    try {
      const uri = await captureCard(card, format);
      if (action === 'share') await shareImage(uri);
      else setNotice((await saveImage(uri)) ? 'saved' : 'denied');
    } catch {
      setNotice('failed');
    } finally {
      setBusy(null);
    }
  };

  const columns = sheetColumns(outfits.length);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        testID="share-sheet"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.lg,
        }}
      >
        <AppText variant="heading">{t('share.title')}</AppText>

        <View
          ref={card}
          collapsable={false}
          testID="share-card"
          style={{
            alignSelf: 'center',
            width: PREVIEW_WIDTH,
            height: PREVIEW_WIDTH / FORMAT_RATIO[format],
            backgroundColor: CARD.background,
            padding: 12,
            gap: 8,
          }}
        >
          {title ? (
            <AppText
              testID="share-card-title"
              variant="label"
              style={{ color: CARD.text }}
              numberOfLines={1}
            >
              {title}
            </AppText>
          ) : null}
          {single ? (
            <View style={{ flex: 1 }}>
              <OutfitPicture outfit={outfits[0]} content={content} />
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
              {outfits.map((outfit) => (
                <View
                  key={outfit.id}
                  testID={`share-tile-${outfit.id}`}
                  style={{
                    width: `${100 / columns}%`,
                    height: `${100 / Math.ceil(outfits.length / columns)}%`,
                    padding: 3,
                  }}
                >
                  <OutfitPicture outfit={outfit} content={content} />
                </View>
              ))}
            </View>
          )}
          {single && withItems ? (
            <View testID="share-item-list" style={{ flexDirection: 'row', gap: 6 }}>
              {outfits[0].items.slice(0, 5).map((item) => (
                <View key={item.id} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Image
                    source={{ uri: imageStore.uri(item.thumbPath) }}
                    contentFit="contain"
                    style={{ width: '100%', aspectRatio: 1 }}
                  />
                  <AppText style={{ fontSize: 7, color: CARD.muted }} numberOfLines={1}>
                    {item.brand ?? item.name ?? ''}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {contents.length > 1 ? (
          <Chips
            testIDPrefix="share-content"
            options={contents.map((value) => ({ value, label: t(`share.content.${value}`) }))}
            selected={[content]}
            onToggle={setContent}
          />
        ) : null}
        <Chips
          testIDPrefix="share-format"
          options={SHARE_FORMATS.map((value) => ({ value, label: t(`share.format.${value}`) }))}
          selected={[format]}
          onToggle={setFormat}
        />
        {single ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <AppText style={{ flex: 1 }}>{t('share.includeItems')}</AppText>
            <Switch testID="share-with-items" value={withItems} onValueChange={setWithItems} />
          </View>
        ) : null}

        {notice === 'saved' ? <AppText testID="share-notice">{t('share.saved')}</AppText> : null}
        {notice === 'failed' ? (
          <AppText testID="share-notice" style={{ color: colors.danger }}>
            {t('share.failed')}
          </AppText>
        ) : null}
        {notice === 'denied' ? (
          <View
            testID="share-denied"
            style={{
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.md,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <AppText>{t('share.denied')}</AppText>
            <Button
              kind="secondary"
              label={t('avatar.openSystemSettings')}
              onPress={() => void Linking.openSettings()}
            />
          </View>
        ) : null}

        <Button
          testID="share-send"
          icon="share-outline"
          label={t('share.share')}
          loading={busy === 'share'}
          disabled={busy !== null}
          onPress={() => void run('share')}
        />
        <Button
          testID="share-save"
          kind="secondary"
          icon="download-outline"
          label={t('share.save')}
          loading={busy === 'save'}
          disabled={busy !== null}
          onPress={() => void run('save')}
        />
        <Button testID="share-close" kind="secondary" label={t('common.close')} onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
