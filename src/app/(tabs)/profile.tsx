import { Image } from 'expo-image';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Row, Screen } from '@/components/ui';
import { formatHeight, lengthSystem } from '@/profile/units';
import { useProfile } from '@/profile/useProfile';
import { imageStore } from '@/storage/imageStore';
import { useTheme } from '@/theme/useTheme';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { data: profile } = useProfile();
  const system = lengthSystem(getLocales()[0]?.regionCode);
  const notSet = t('common.notSet');

  return (
    <Screen scroll>
      <AppText variant="title" style={{ marginVertical: spacing.lg }}>
        {t('profile.title')}
      </AppText>

      {profile ? (
        <View style={{ gap: spacing.lg, marginBottom: spacing.xl }}>
          <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
            {profile.avatarPath ? (
              <Image
                testID="profile-avatar"
                source={{ uri: imageStore.uri(profile.avatarPath) }}
                contentFit="cover"
                style={{ width: 96, height: 128, borderRadius: radius.md }}
              />
            ) : (
              <View
                testID="profile-no-avatar"
                style={{
                  width: 96,
                  height: 128,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: spacing.sm,
                }}
              >
                <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                  {t('profile.noPhoto')}
                </AppText>
              </View>
            )}
            <View style={{ flex: 1, gap: spacing.sm }}>
              <AppText variant="heading" testID="profile-name">
                {profile.name}
              </AppText>
              <Button
                testID="edit-profile"
                kind="secondary"
                icon="create-outline"
                label={t('profile.edit')}
                onPress={() => router.push('/profile/edit')}
              />
            </View>
          </View>

          <View>
            <Row
              label={t('gender.title')}
              value={profile.gender ? t(`gender.${profile.gender}`) : notSet}
            />
            <Row
              label={t('bodyType.title')}
              value={profile.bodyType ? t(`bodyType.${profile.bodyType}`) : notSet}
            />
            <Row
              label={t('profile.height')}
              value={profile.heightCm ? formatHeight(profile.heightCm, system) : notSet}
            />
            <Row label={t('profile.sizeTop')} value={profile.sizeTop ?? notSet} />
            <Row label={t('profile.sizeBottom')} value={profile.sizeBottom ?? notSet} />
            <Row label={t('profile.sizeShoes')} value={profile.sizeShoes ?? notSet} />
          </View>
        </View>
      ) : null}

      <Row
        testID="open-settings"
        icon="settings-outline"
        label={t('profile.settings')}
        onPress={() => router.push('/settings')}
      />
    </Screen>
  );
}
