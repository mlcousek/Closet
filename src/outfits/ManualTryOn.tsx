import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { displayPath } from '@/closet/types';
import { AppText, Button } from '@/components/ui';
import { pickPhoto, pickPhotos } from '@/profile/photo';
import { useProfile } from '@/profile/useProfile';
import { shareImage } from '@/sharing/share';
import { useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

import { SHEET_POINTS, SHEET_RATIO, manualPrompt, pieceColumns } from './manualSheet';
import { avatarBasePath, saveManualRender } from './renderActions';
import type { Outfit } from './repository';

const PREVIEW_WIDTH = 300;
/** How much the full-size sheet is shrunk to be shown; its own sizes are given at full size. */
const PREVIEW_SCALE = PREVIEW_WIDTH / SHEET_POINTS;
/** The sheet is always light, whatever the app's appearance, so the other app sees clean pictures. */
const SHEET = { background: '#FFFFFF', badge: '#1B1622', badgeText: '#FFFFFF' };

/**
 * Try-on without a provider key: the user's photo and the outfit's pieces go,
 * as one picture and through the system share sheet, to an assistant app the
 * user already has; the picture made there is then added back from Photos.
 * With several outfits it walks through them one after another, and the
 * finished pictures can be added in one go for all that have none yet.
 */
export function ManualTryOn({ outfits, onClose }: { outfits: Outfit[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const showToast = useToast((state) => state.show);
  const { data: profile } = useProfile();
  const sheet = useRef<View>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<'share' | 'add' | 'addAll' | null>(null);
  const [notice, setNotice] = useState<'copied' | 'failed' | null>(null);
  /** The outfits that got a picture in this run, so no picture is given to one of them twice. */
  const [added, setAdded] = useState<string[]>([]);
  // A flag that is set at once: two taps in one frame both see the state as it was.
  const working = useRef(false);

  const outfit = outfits[index];
  const several = outfits.length > 1;
  const waiting = outfits.filter((entry) => !added.includes(entry.id));

  const run = async (kind: 'share' | 'add' | 'addAll', action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(kind);
    setNotice(null);
    try {
      await action();
    } catch {
      setNotice('failed');
    } finally {
      working.current = false;
      setBusy(null);
    }
  };

  /** Records which outfits have their picture, then closes or moves to one that still waits. */
  const settle = (ids: string[]) => {
    const all = [...added, ...ids];
    setAdded(all);
    if (outfits.every((entry) => all.includes(entry.id))) {
      showToast({
        message: several
          ? t('manualTryOn.addedSeveral', { count: all.length })
          : t('manualTryOn.added'),
      });
      onClose();
      return;
    }
    const isWaiting = (entry: Outfit) => !all.includes(entry.id);
    const after = outfits.findIndex((entry, position) => position > index && isWaiting(entry));
    setIndex(after >= 0 ? after : outfits.findIndex(isWaiting));
  };
  const photoPath = avatarBasePath(profile ?? null);
  const columns = pieceColumns(outfit.entries.length);
  const rows = Math.ceil(outfit.entries.length / columns);

  const share = () =>
    run('share', async () => {
      await Clipboard.setStringAsync(manualPrompt(outfit, photoPath !== null));
      setNotice('copied');
      const uri = await captureRef(sheet, {
        format: 'jpg',
        quality: 0.92,
        result: 'tmpfile',
        // The sheet at its own size, not as it appears: drawing the layer itself ignores
        // the shrinking and the clipping around it, and works for a view larger than the
        // screen, which a snapshot of the screen does not.
        width: SHEET_POINTS,
        height: SHEET_POINTS / SHEET_RATIO,
        useRenderInContext: true,
      });
      await shareImage(uri, 'image/jpeg');
    });

  const add = () =>
    run('add', async () => {
      const picked = await pickPhoto('library');
      if (picked.status !== 'picked') return;
      await saveManualRender(outfit, picked.photo);
      settle([outfit.id]);
    });

  /**
   * The pictures are taken in the order they were picked, one for each outfit
   * that has none yet. What was stored before a failure stays recorded, so
   * trying again continues with the rest instead of adding the same ones twice.
   */
  const addAll = () =>
    run('addAll', async () => {
      const photos = await pickPhotos(waiting.length);
      const saved: string[] = [];
      try {
        for (const [position, photo] of photos.slice(0, waiting.length).entries()) {
          await saveManualRender(waiting[position], photo);
          saved.push(waiting[position].id);
        }
      } finally {
        if (saved.length > 0) settle(saved);
      }
    });

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
        {several ? (
          <AppText testID="manual-progress" variant="label">
            {t('manualTryOn.progress', { current: index + 1, total: outfits.length })}
            {outfit.name ? ` · ${outfit.name}` : ''}
            {added.includes(outfit.id) ? ' ✓' : ''}
          </AppText>
        ) : null}

        <View
          style={{
            alignSelf: 'center',
            width: PREVIEW_WIDTH,
            height: PREVIEW_WIDTH / SHEET_RATIO,
            overflow: 'hidden',
          }}
        >
          <View
            collapsable={false}
            style={{
              width: SHEET_POINTS,
              height: SHEET_POINTS / SHEET_RATIO,
              transform: [{ scale: PREVIEW_SCALE }],
              transformOrigin: 'top left',
            }}
          >
            <View
              ref={sheet}
              collapsable={false}
              testID="manual-sheet"
              style={{
                width: SHEET_POINTS,
                height: SHEET_POINTS / SHEET_RATIO,
                backgroundColor: SHEET.background,
                flexDirection: 'row',
                padding: 16,
                gap: 16,
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
                    style={{ width: `${100 / columns}%`, height: `${100 / rows}%`, padding: 6 }}
                  >
                    <Image
                      source={{ uri: imageStore.uri(displayPath(item)) }}
                      contentFit="contain"
                      style={{ flex: 1 }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        minWidth: 42,
                        height: 42,
                        borderRadius: 21,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: SHEET.badge,
                      }}
                    >
                      <AppText style={{ fontSize: 26, lineHeight: 36, color: SHEET.badgeText }}>
                        {index + 1}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            </View>
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
          {several ? <AppText muted>{t('manualTryOn.severalHint')}</AppText> : null}
        </View>

        {several && added.length > 0 ? (
          <AppText testID="manual-added">
            {t('manualTryOn.addedSeveral', { count: added.length })}
          </AppText>
        ) : null}
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
        {several ? (
          <>
            <Button
              testID="manual-next"
              kind="secondary"
              icon="arrow-forward-outline"
              label={t('manualTryOn.next')}
              disabled={busy !== null}
              onPress={() => {
                setNotice(null);
                // After the last one it starts again from the first.
                setIndex((index + 1) % outfits.length);
              }}
            />
            <Button
              testID="manual-add-all"
              kind="secondary"
              icon="images-outline"
              label={t('manualTryOn.addAll', { count: waiting.length })}
              loading={busy === 'addAll'}
              disabled={busy !== null}
              onPress={() => void addAll()}
            />
          </>
        ) : null}
        <Button
          testID="manual-close"
          kind="secondary"
          label={t('common.close')}
          disabled={busy !== null}
          onPress={onClose}
        />
      </ScrollView>
    </Modal>
  );
}
