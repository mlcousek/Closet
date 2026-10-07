import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Modal, PixelRatio, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { displayPath } from '@/closet/types';
import { AppText, Button } from '@/components/ui';
import { pickPhoto } from '@/profile/photo';
import { useProfile } from '@/profile/useProfile';
import { shareImage } from '@/sharing/share';
import { useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

import { SHEET_RATIO, SHEET_WIDTH, manualPrompt, pieceColumns } from './manualSheet';
import { avatarBasePath, saveManualRender } from './renderActions';
import type { Outfit } from './repository';

const PREVIEW_WIDTH = 300;
/** The sheet is always light, whatever the app's appearance, so the other app sees clean pictures. */
const SHEET = { background: '#FFFFFF', badge: '#1B1622', badgeText: '#FFFFFF' };

/**
 * Try-on without a provider key: the user's photo and the outfit's pieces go,
 * as one picture and through the system share sheet, to an assistant app the
 * user already has; the picture made there is then added back from Photos.
 */
export function ManualTryOn({ outfit, onClose }: { outfit: Outfit; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const showToast = useToast((state) => state.show);
  const { data: profile } = useProfile();
  const sheet = useRef<View>(null);
  const [busy, setBusy] = useState<'share' | 'add' | null>(null);
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null);

  const photoPath = avatarBasePath(profile ?? null);
  const columns = pieceColumns(outfit.entries.length);
  const rows = Math.ceil(outfit.entries.length / columns);

  const share = async () => {
    setBusy('share');
    setNotice(null);
    try {
      await Clipboard.setStringAsync(manualPrompt(outfit, photoPath !== null));
      setNotice('copied');
      const uri = await captureRef(sheet, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
        width: SHEET_WIDTH / PixelRatio.get(),
        height: Math.round(SHEET_WIDTH / SHEET_RATIO) / PixelRatio.get(),
      });
      await shareImage(uri, 'image/jpeg');
    } catch {
      setNotice('failed');
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    setBusy('add');
    setNotice(null);
    try {
      const picked = await pickPhoto('library');
      if (picked.status !== 'picked') return;
      await saveManualRender(outfit, picked.photo);
      showToast({ message: t('manualTryOn.added') });
      onClose();
    } catch {
      setNotice('failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        testID="manual-try-on"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          gap: spacing.lg,
        }}
      >
        <AppText variant="heading">{t('manualTryOn.title')}</AppText>
        <AppText muted>{t('manualTryOn.explain')}</AppText>

        <View
          ref={sheet}
          collapsable={false}
          testID="manual-sheet"
          style={{
            alignSelf: 'center',
            width: PREVIEW_WIDTH,
            height: PREVIEW_WIDTH / SHEET_RATIO,
            backgroundColor: SHEET.background,
            flexDirection: 'row',
            padding: 6,
            gap: 6,
          }}
        >
          {photoPath ? (
            <Image
              testID="manual-sheet-photo"
              source={{ uri: imageStore.uri(photoPath) }}
              contentFit="contain"
              style={{ flex: 9 }}
            />
          ) : null}
          <View style={{ flex: 11, flexDirection: 'row', flexWrap: 'wrap' }}>
            {outfit.entries.map(({ item }, index) => (
              <View
                key={item.id}
                testID={`manual-sheet-piece-${item.id}`}
                style={{ width: `${100 / columns}%`, height: `${100 / rows}%`, padding: 2 }}
              >
                <Image
                  source={{ uri: imageStore.uri(displayPath(item)) }}
                  contentFit="contain"
                  style={{ flex: 1 }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: 2,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: SHEET.badge,
                  }}
                >
                  <AppText style={{ fontSize: 10, lineHeight: 14, color: SHEET.badgeText }}>
                    {index + 1}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </View>

        {photoPath ? null : (
          <AppText testID="manual-no-photo" muted>
            {t('manualTryOn.noPhoto')}
          </AppText>
        )}

        <View style={{ gap: spacing.sm }}>
          <AppText>{t('manualTryOn.step1')}</AppText>
          <AppText>{t('manualTryOn.step2')}</AppText>
          <AppText>{t('manualTryOn.step3')}</AppText>
        </View>

        {notice === 'copied' ? (
          <AppText testID="manual-notice">{t('manualTryOn.copied')}</AppText>
        ) : null}
        {notice === 'failed' ? (
          <AppText testID="manual-notice" style={{ color: colors.danger }}>
            {t('common.somethingWentWrong')}
          </AppText>
        ) : null}

        <Button
          testID="manual-share"
          icon="share-outline"
          label={t('manualTryOn.share')}
          loading={busy === 'share'}
          disabled={busy !== null}
          onPress={() => void share()}
        />
        <Button
          testID="manual-add"
          kind="secondary"
          icon="image-outline"
          label={t('manualTryOn.add')}
          loading={busy === 'add'}
          disabled={busy !== null}
          onPress={() => void add()}
        />
        <Button
          testID="manual-close"
          kind="secondary"
          label={t('common.close')}
          onPress={onClose}
        />
      </ScrollView>
    </Modal>
  );
}
