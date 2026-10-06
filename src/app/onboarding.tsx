import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Field, Screen } from '@/components/ui';
import { AvatarPicker } from '@/profile/AvatarPicker';
import { storeAvatarAnd } from '@/profile/avatar';
import { avatarDeps, type PickedPhoto } from '@/profile/photo';
import { BodyTypePicker, GenderPicker } from '@/profile/pickers';
import type { BodyType, Gender } from '@/profile/types';
import { useSaveProfile } from '@/profile/useProfile';
import { useTheme } from '@/theme/useTheme';

const STEPS = ['welcome', 'name', 'gender', 'bodyType', 'avatar'] as const;
type Step = (typeof STEPS)[number];

/** First-run flow: collects name, gender, body type and a full-body photo. Only the name is required. */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const saveProfile = useSaveProfile();

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [bodyType, setBodyType] = useState<BodyType | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoPending, setPhotoPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = STEPS.indexOf(step);
  const go = (offset: number) => setStep(STEPS[index + offset]);

  const finish = async (withPhoto: PickedPhoto | null) => {
    setSaving(true);
    setError(null);
    const values = { name: name.trim(), gender, bodyType };
    try {
      if (withPhoto) {
        await storeAvatarAnd(withPhoto, avatarDeps, (stored) =>
          saveProfile.mutateAsync({ ...values, ...stored }),
        );
      } else {
        await saveProfile.mutateAsync(values);
      }
      router.replace('/');
    } catch {
      setError(t('onboarding.saveFailed'));
      setSaving(false);
    }
  };

  const skippable = step === 'gender' || step === 'bodyType' || step === 'avatar';
  const isLast = step === 'avatar';
  const canContinue = step !== 'name' || name.trim().length > 0;

  const skip = () => {
    // Skipping leaves the value unset, even if something was tapped first.
    if (step === 'gender') setGender(null);
    if (step === 'bodyType') setBodyType(null);
    if (step === 'avatar') setPhoto(null);
    if (isLast) void finish(null);
    else go(1);
  };

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: spacing.xl, paddingTop: spacing.xxl }}>
      {step === 'welcome' ? (
        <>
          <AppText variant="title">{t('onboarding.welcomeTitle')}</AppText>
          <AppText muted>{t('onboarding.welcomeMessage')}</AppText>
        </>
      ) : null}

      {step === 'name' ? (
        <>
          <AppText variant="title">{t('onboarding.nameTitle')}</AppText>
          <Field
            testID="onboarding-name"
            value={name}
            onChangeText={setName}
            placeholder={t('onboarding.namePlaceholder')}
            autoFocus
          />
        </>
      ) : null}

      {step === 'gender' ? (
        <>
          <AppText variant="title">{t('onboarding.genderTitle')}</AppText>
          <AppText muted>{t('onboarding.genderMessage')}</AppText>
          <GenderPicker value={gender} onChange={setGender} />
        </>
      ) : null}

      {step === 'bodyType' ? (
        <>
          <AppText variant="title">{t('onboarding.bodyTypeTitle')}</AppText>
          <AppText muted>{t('onboarding.bodyTypeMessage')}</AppText>
          <BodyTypePicker gender={gender} value={bodyType} onChange={setBodyType} />
        </>
      ) : null}

      {step === 'avatar' ? (
        <>
          <AppText variant="title">{t('onboarding.avatarTitle')}</AppText>
          <AvatarPicker
            currentUri={photo?.uri ?? null}
            onAccept={setPhoto}
            onPendingChange={setPhotoPending}
          />
        </>
      ) : null}

      {error ? (
        <AppText testID="onboarding-error" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          testID="onboarding-next"
          label={t(
            step === 'welcome' ? 'onboarding.start' : isLast ? 'onboarding.finish' : 'common.next',
          )}
          disabled={!canContinue || (isLast && (!photo || (photoPending && step === 'avatar')))}
          loading={saving}
          onPress={() => (isLast ? void finish(photo) : go(1))}
        />
        {skippable ? (
          <Button
            testID="onboarding-skip"
            kind="secondary"
            label={t('common.skip')}
            disabled={saving}
            onPress={skip}
          />
        ) : null}
        {index > 0 ? (
          <Button
            testID="onboarding-back"
            kind="secondary"
            label={t('common.back')}
            disabled={saving}
            onPress={() => go(-1)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
