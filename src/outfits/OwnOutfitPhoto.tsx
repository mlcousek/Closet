import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button } from '@/components/ui';
import { pickPhoto } from '@/profile/photo';
import { attempt, useToast } from '@/shell/toast';
import { useTheme } from '@/theme/useTheme';

import { saveManualRender } from './renderActions';
import type { Outfit } from './repository';

/**
 * Lets the user take or choose their own photo of the outfit and show it as
 * the outfit's picture, for when a good photo exists and nothing needs to be
 * generated. Nothing is sent anywhere and no key is needed.
 */
export function OwnOutfitPhoto({ outfit, onAdded }: { outfit: Outfit; onAdded?: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const showToast = useToast((state) => state.show);
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);
  const [denied, setDenied] = useState(false);
  // A flag that is set at once: two taps in one frame both see the state as it was.
  const working = useRef(false);

  const choose = async (source: 'camera' | 'library') => {
    if (working.current) return;
    working.current = true;
    setBusy(source);
    setDenied(false);
    try {
      const result = await pickPhoto(source);
      if (result.status === 'denied') setDenied(true);
      if (result.status !== 'picked') return;
      await saveManualRender(outfit, result.photo, 'photo');
      showToast({ message: t('outfitPhoto.added') });
      onAdded?.();
    } finally {
      working.current = false;
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <AppText muted>{t('outfitPhoto.explain')}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            testID="outfit-photo-camera"
            kind="secondary"
            icon="camera-outline"
            label={t('outfitPhoto.take')}
            loading={busy === 'camera'}
            disabled={busy !== null}
            onPress={() => attempt(() => choose('camera'), t('common.somethingWentWrong'))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID="outfit-photo-library"
            kind="secondary"
            icon="images-outline"
            label={t('outfitPhoto.choose')}
            loading={busy === 'library'}
            disabled={busy !== null}
            onPress={() => attempt(() => choose('library'), t('common.somethingWentWrong'))}
          />
        </View>
      </View>
      {denied ? (
        <View
          testID="outfit-photo-denied"
          style={{
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <AppText>{t('outfitPhoto.denied')}</AppText>
          <Button
            label={t('avatar.openSystemSettings')}
            kind="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
    </View>
  );
}
