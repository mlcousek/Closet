import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Field, Screen } from '@/components/ui';
import { StudioAvatar } from '@/outfits/StudioAvatar';
import { AvatarPicker } from '@/profile/AvatarPicker';
import { discardAvatar, storeAvatarAnd } from '@/profile/avatar';
import { avatarDeps, type PickedPhoto } from '@/profile/photo';
import { BodyTypePicker, GenderPicker } from '@/profile/pickers';
import type { Profile } from '@/profile/types';
import { cmToFeetInches, lengthSystem, parseHeight } from '@/profile/units';
import { useProfile, useSaveProfile } from '@/profile/useProfile';
import { useToast } from '@/shell/toast';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

function EditForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const saveProfile = useSaveProfile();
  const showToast = useToast((state) => state.show);
  const system = lengthSystem(getLocales()[0]?.regionCode);

  const initialHeight = () => {
    if (!profile.heightCm) return '';
    if (system === 'metric') return String(profile.heightCm);
    const { feet, inches } = cmToFeetInches(profile.heightCm);
    return `${feet} ${inches}`;
  };

  const [name, setName] = useState(profile.name);
  const [gender, setGender] = useState(profile.gender);
  const [bodyType, setBodyType] = useState(profile.bodyType);
  const [height, setHeight] = useState(initialHeight);
  const [sizeTop, setSizeTop] = useState(profile.sizeTop ?? '');
  const [sizeBottom, setSizeBottom] = useState(profile.sizeBottom ?? '');
  const [sizeShoes, setSizeShoes] = useState(profile.sizeShoes ?? '');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState<string | null>(null);

  const chooseAvatar = (photo: PickedPhoto) => {
    if (!profile.avatarStudioPath) {
      void replaceAvatar(photo);
      return;
    }
    Alert.alert(t('avatar.replaceStudioTitle'), t('avatar.replaceStudioMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('avatar.replaceStudioAction'), onPress: () => void replaceAvatar(photo) },
    ]);
  };

  const replaceAvatar = async (photo: PickedPhoto) => {
    setBusy(true);
    setError(null);
    try {
      await storeAvatarAnd(photo, avatarDeps, async (stored, { isolated }) => {
        await saveProfile.mutateAsync({ ...stored, avatarStudioPath: null });
        if (!isolated) showToast({ message: t('avatar.notIsolated') });
      });
      if (profile.avatarStudioPath) await avatarDeps.remove(profile.avatarStudioPath);
      // The old files are only deleted once the profile points at the new ones.
      await discardAvatar(profile, avatarDeps);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = () => {
    Alert.alert(t('avatar.removeConfirmTitle'), t('avatar.removeConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await saveProfile.mutateAsync({
              avatarPath: null,
              avatarSmallPath: null,
              avatarStudioPath: null,
            });
            if (profile.avatarStudioPath) await avatarDeps.remove(profile.avatarStudioPath);
            await discardAvatar(profile, avatarDeps);
          })().catch(() => setError(t('common.somethingWentWrong')));
        },
      },
    ]);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t('profile.nameRequired'));
      return;
    }
    const heightCm = height.trim() ? parseHeight(height, system) : null;
    if (height.trim() && heightCm === null) {
      setError(t('profile.heightInvalid'));
      return;
    }
    setBusy(true);
    try {
      await saveProfile.mutateAsync({
        name: name.trim(),
        gender,
        bodyType,
        heightCm,
        sizeTop: sizeTop.trim() || null,
        sizeBottom: sizeBottom.trim() || null,
        sizeShoes: sizeShoes.trim() || null,
      });
      showToast({ message: t('profile.saved') });
      // Left while saving: going back now would close whichever screen is open instead.
      if (mounted.current) router.back();
    } catch {
      setError(t('common.somethingWentWrong'));
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={[]} style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
      <Field testID="edit-name" label={t('profile.name')} value={name} onChangeText={setName} />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('avatar.title')}
        </AppText>
        <AvatarPicker
          currentUri={
            // The copy outfit pictures are made from, so what is shown is what is used.
            (profile.avatarSmallPath ?? profile.avatarPath)
              ? imageStore.uri((profile.avatarSmallPath ?? profile.avatarPath)!)
              : null
          }
          onAccept={chooseAvatar}
          showGuidance={!profile.avatarPath}
        />
        {profile.avatarPath ? (
          <Button
            testID="remove-avatar"
            kind="danger"
            label={t('avatar.remove')}
            onPress={removeAvatar}
          />
        ) : null}
      </View>

      <StudioAvatar profile={profile} />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('gender.title')}
        </AppText>
        <GenderPicker value={gender} onChange={setGender} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" muted>
          {t('bodyType.title')}
        </AppText>
        <BodyTypePicker gender={gender} value={bodyType} onChange={setBodyType} />
      </View>

      <View style={{ gap: spacing.md }}>
        <AppText variant="heading">{t('profile.sizes')}</AppText>
        <Field
          testID="edit-height"
          label={t('profile.height')}
          value={height}
          onChangeText={setHeight}
          placeholder={t(
            system === 'metric'
              ? 'profile.heightPlaceholderMetric'
              : 'profile.heightPlaceholderImperial',
          )}
          keyboardType={system === 'metric' ? 'number-pad' : 'numbers-and-punctuation'}
        />
        <Field
          testID="edit-size-top"
          label={t('profile.sizeTop')}
          value={sizeTop}
          onChangeText={setSizeTop}
        />
        <Field
          testID="edit-size-bottom"
          label={t('profile.sizeBottom')}
          value={sizeBottom}
          onChangeText={setSizeBottom}
        />
        <Field
          testID="edit-size-shoes"
          label={t('profile.sizeShoes')}
          value={sizeShoes}
          onChangeText={setSizeShoes}
        />
      </View>

      {error ? (
        <AppText testID="edit-error" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}

      <Button
        testID="edit-save"
        label={t('common.save')}
        loading={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}

export default function EditProfileScreen() {
  const { data: profile } = useProfile();
  // The form copies the profile into local state once, so it only mounts when the profile is loaded.
  return profile ? <EditForm profile={profile} /> : null;
}
