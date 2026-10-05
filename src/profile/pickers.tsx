import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { BodySilhouette } from './BodySilhouette';
import { BODY_TYPES, GENDERS, type BodyType, type Gender } from './types';

export function GenderPicker({
  value,
  onChange,
}: {
  value: Gender | null;
  onChange: (gender: Gender) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
      {GENDERS.map((gender) => {
        const selected = gender === value;
        return (
          <Pressable
            key={gender}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={`gender-${gender}`}
            onPress={() => onChange(gender)}
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.surfaceAlt : colors.surface,
            }}
          >
            <AppText variant="label">{t(`gender.${gender}`)}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BodyTypePicker({
  gender,
  value,
  onChange,
}: {
  gender: Gender | null;
  value: BodyType | null;
  onChange: (bodyType: BodyType) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      testID={`body-types-${gender ?? 'unspecified'}`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' }}
    >
      {BODY_TYPES.map((bodyType) => {
        const selected = bodyType === value;
        return (
          <Pressable
            key={bodyType}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(`bodyType.${bodyType}`)}
            testID={`body-type-${bodyType}`}
            onPress={() => onChange(bodyType)}
            style={{
              width: 100,
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.surfaceAlt : colors.surface,
            }}
          >
            <BodySilhouette
              gender={gender}
              bodyType={bodyType}
              color={selected ? colors.text : colors.textMuted}
              height={96}
            />
            <AppText variant="caption">{t(`bodyType.${bodyType}`)}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
