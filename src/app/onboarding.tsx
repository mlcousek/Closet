import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Field, Screen } from '@/components/ui';
import { useSaveProfile } from '@/profile/useProfile';
import { useTheme } from '@/theme/useTheme';

/** Start with a name; optional try-on details remain available in Profile. */
export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const saveProfile = useSaveProfile();
  const [started, setStarted] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acting = useRef(false);

  const finish = async () => {
    if (acting.current || !name.trim()) return;
    acting.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveProfile.mutateAsync({ name: name.trim(), gender: null, bodyType: null });
      router.replace('/closet');
    } catch {
      setError(t('onboarding.saveFailed'));
      acting.current = false;
      setSaving(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: spacing.xl, paddingTop: spacing.xxl }}>
      <AppText variant="title">
        {t(started ? 'onboarding.nameTitle' : 'onboarding.welcomeTitle')}
      </AppText>
      <AppText muted>{t(started ? 'onboarding.quickStart' : 'onboarding.welcomeMessage')}</AppText>
      {started ? (
        <Field
          testID="onboarding-name"
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.namePlaceholder')}
          autoFocus
        />
      ) : null}
      {error ? (
        <AppText testID="onboarding-error" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Button
          testID="onboarding-next"
          label={t(started ? 'onboarding.addClothes' : 'onboarding.start')}
          disabled={started && !name.trim()}
          loading={saving}
          onPress={() => (started ? void finish() : setStarted(true))}
        />
        {started ? (
          <Button
            testID="onboarding-back"
            kind="secondary"
            label={t('common.back')}
            disabled={saving}
            onPress={() => setStarted(false)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
