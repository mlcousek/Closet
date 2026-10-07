import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { KeyNeededPrompt } from '@/ai/KeyNeededPrompt';
import { TryOnError, type TryOnFailure } from '@/ai/tryOn';
import { AppText, Button } from '@/components/ui';
import type { Profile } from '@/profile/types';
import { useSaveProfile } from '@/profile/useProfile';
import { imageStore } from '@/storage/imageStore';
import { attempt } from '@/shell/toast';
import { useTheme } from '@/theme/useTheme';

import { createStudioAvatar, getStudioCandidate, setStudioCandidate } from './renderActions';
import { confirmDisclosure } from './useRenderRequest';

/**
 * Failures whose render message speaks of an outfit and so does not fit here.
 * Every other one is explained in the words used for renders, among them the
 * warnings that a request may have been charged.
 */
const STUDIO_MESSAGE: Partial<Record<TryOnFailure, string>> = {
  declined: 'studio.declined',
  error: 'studio.failed',
};

/**
 * Lets the user create a studio version of their photo, look at the result,
 * and choose whether renders use it or the original photo.
 */
export function StudioAvatar({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const saveProfile = useSaveProfile();
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidateState] = useState<string | null>(getStudioCandidate);
  const setCandidate = (path: string | null) => {
    setStudioCandidate(path);
    setCandidateState(path);
  };
  const [problem, setProblem] = useState<TryOnFailure | null>(null);

  if (!profile.avatarSmallPath) return null;

  const create = async () => {
    if (!(await confirmDisclosure(t))) return;
    setBusy(true);
    setProblem(null);
    try {
      setCandidate(await createStudioAvatar());
    } catch (error) {
      setProblem(error instanceof TryOnError ? error.reason : 'error');
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!candidate) return;
    const replaced = profile.avatarStudioPath;
    await saveProfile.mutateAsync({ avatarStudioPath: candidate });
    setCandidate(null);
    if (replaced) await imageStore.remove(replaced).catch(() => {});
  };

  const reject = async () => {
    if (!candidate) return;
    // A rejected image is discarded and the original photo stays the base.
    await imageStore.remove(candidate).catch(() => {});
    setCandidate(null);
  };

  const backToOriginal = async () => {
    const studio = profile.avatarStudioPath;
    await saveProfile.mutateAsync({ avatarStudioPath: null });
    if (studio) await imageStore.remove(studio).catch(() => {});
  };

  const shown = candidate ?? profile.avatarStudioPath;

  return (
    <View testID="studio-avatar" style={{ gap: spacing.md }}>
      <AppText variant="label" muted>
        {t('studio.title')}
      </AppText>
      <AppText muted>{t('studio.explain')}</AppText>

      {shown ? (
        <Image
          testID="studio-preview"
          source={{ uri: imageStore.uri(shown) }}
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

      {candidate ? (
        <>
          <AppText>{t('studio.review')}</AppText>
          <Button
            testID="studio-accept"
            label={t('studio.accept')}
            onPress={() => attempt(() => accept(), t('common.somethingWentWrong'))}
          />
          <Button
            testID="studio-reject"
            kind="secondary"
            label={t('studio.reject')}
            onPress={() => attempt(() => reject(), t('common.somethingWentWrong'))}
          />
        </>
      ) : (
        <>
          {profile.avatarStudioPath ? (
            <AppText testID="studio-in-use" muted>
              {t('studio.inUse')}
            </AppText>
          ) : null}
          <Button
            testID="studio-create"
            kind="secondary"
            icon="sparkles-outline"
            label={t(busy ? 'studio.creating' : 'studio.create')}
            loading={busy}
            onPress={() => void create()}
          />
          {profile.avatarStudioPath ? (
            <Button
              testID="studio-remove"
              kind="secondary"
              label={t('studio.remove')}
              onPress={() => attempt(() => backToOriginal(), t('common.somethingWentWrong'))}
            />
          ) : null}
        </>
      )}

      {problem === 'noKey' ? <KeyNeededPrompt provider="image" /> : null}
      {problem && problem !== 'noKey' ? (
        <AppText testID="studio-failed" style={{ color: colors.danger }}>
          {t(STUDIO_MESSAGE[problem] ?? `tryOn.failure.${problem}`)}
        </AppText>
      ) : null}
    </View>
  );
}
