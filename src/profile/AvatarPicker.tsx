import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import type { AvatarIssue } from './avatar';
import { BodySilhouette } from './BodySilhouette';
import { checkAvatarPhoto, pickPhoto, type PickedPhoto } from './photo';

type Props = {
  /** URI of the photo to show as the current choice, if any. */
  currentUri: string | null;
  onAccept: (photo: PickedPhoto) => void;
  showGuidance?: boolean;
};

function Example({ good }: { good: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.xs, flex: 1 }}>
      <View
        style={{
          width: 96,
          height: 128,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: good ? 'center' : 'flex-start',
          overflow: 'hidden',
        }}
      >
        <BodySilhouette
          gender={null}
          bodyType="average"
          color={colors.textMuted}
          height={good ? 108 : 220}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Ionicons
          name={good ? 'checkmark-circle' : 'close-circle'}
          size={16}
          color={good ? colors.success : colors.danger}
        />
        <AppText variant="caption">{t(good ? 'avatar.exampleGood' : 'avatar.exampleBad')}</AppText>
      </View>
    </View>
  );
}

/** Lets the user take or choose a full-body photo, checks it and warns without blocking. */
export function AvatarPicker({ currentUri, onAccept, showGuidance = true }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<{ photo: PickedPhoto; issue: AvatarIssue } | null>(null);

  const choose = async (source: 'camera' | 'library') => {
    setBusy(true);
    setDenied(false);
    try {
      const result = await pickPhoto(source);
      if (result.status === 'denied') setDenied(true);
      if (result.status !== 'picked') return;
      const issue = await checkAvatarPhoto(result.photo.uri);
      if (issue) setPending({ photo: result.photo, issue });
      else {
        setPending(null);
        onAccept(result.photo);
      }
    } finally {
      setBusy(false);
    }
  };

  const shownUri = pending?.photo.uri ?? currentUri;

  return (
    <View style={{ gap: spacing.lg }}>
      {showGuidance ? (
        <View style={{ gap: spacing.md }}>
          <AppText muted>{t('avatar.guidance')}</AppText>
          <View style={{ flexDirection: 'row' }}>
            <Example good />
            <Example good={false} />
          </View>
        </View>
      ) : null}

      {shownUri ? (
        <Image
          testID="avatar-preview"
          source={{ uri: shownUri }}
          contentFit="cover"
          style={{
            alignSelf: 'center',
            width: 180,
            height: 240,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceAlt,
          }}
        />
      ) : null}

      {pending ? (
        <View
          testID="avatar-warning"
          style={{
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <AppText>{t(`avatar.issue.${pending.issue}`)}</AppText>
          <Button
            testID="avatar-keep"
            label={t('avatar.keep')}
            kind="secondary"
            onPress={() => {
              onAccept(pending.photo);
              setPending(null);
            }}
          />
        </View>
      ) : null}

      {denied ? (
        <View
          testID="avatar-denied"
          style={{
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            padding: spacing.lg,
            gap: spacing.md,
          }}
        >
          <AppText>{t('avatar.denied')}</AppText>
          <Button
            label={t('avatar.openSystemSettings')}
            kind="secondary"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          testID="avatar-camera"
          icon="camera-outline"
          label={t(shownUri ? 'avatar.retake' : 'avatar.takePhoto')}
          loading={busy}
          onPress={() => void choose('camera')}
        />
        <Button
          testID="avatar-library"
          icon="images-outline"
          kind="secondary"
          label={t('avatar.chooseFromLibrary')}
          disabled={busy}
          onPress={() => void choose('library')}
        />
      </View>
      <AppText variant="caption" muted>
        {t('avatar.privacy')}
      </AppText>
    </View>
  );
}
