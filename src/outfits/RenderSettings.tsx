import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DEFAULT_TEXT_MODEL, getTextModel, setTextModel } from '@/ai/client';
import { DEFAULT_IMAGE_MODEL, getImageModel, setImageModel } from '@/ai/tryOn';
import { AppText, Field } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

import { isAutoRenderOn, setAutoRender, useRenderVersion } from './renderActions';
import { usageLog } from './renders';

/** The render part of the AI settings: automatic rendering, usage so far, and the models used. */
export function RenderSettings() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const version = useRenderVersion((state) => state.version);
  const [auto, setAuto] = useState(isAutoRenderOn);
  // Empty means "use the default", so a stored default is shown as empty.
  const [imageModel, setImage] = useState(() =>
    getImageModel() === DEFAULT_IMAGE_MODEL ? '' : getImageModel(),
  );
  const [textModel, setText] = useState(() =>
    getTextModel() === DEFAULT_TEXT_MODEL ? '' : getTextModel(),
  );
  const { data: usage } = useQuery({
    queryKey: ['ai-usage', 'render', version],
    queryFn: () => usageLog.counts('render'),
  });
  // A studio photo is a paid request to the same provider, counted apart from the renders.
  const { data: studioUsage } = useQuery({
    queryKey: ['ai-usage', 'studio', version],
    queryFn: () => usageLog.counts('studio'),
  });

  return (
    <View
      testID="render-settings"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <AppText variant="heading">{t('tryOn.settingsTitle')}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText style={{ flex: 1 }}>{t('tryOn.autoRender')}</AppText>
        <Switch
          testID="auto-render"
          value={auto}
          onValueChange={(value) => {
            setAuto(value);
            setAutoRender(value);
          }}
        />
      </View>
      <AppText testID="render-usage" muted>
        {t('tryOn.usage', { month: usage?.month ?? 0, total: usage?.total ?? 0 })}
      </AppText>
      <AppText testID="studio-usage" muted>
        {t('tryOn.usageStudio', {
          month: studioUsage?.month ?? 0,
          total: studioUsage?.total ?? 0,
        })}
      </AppText>
      <Field
        testID="image-model"
        label={t('tryOn.imageModel')}
        value={imageModel}
        placeholder={DEFAULT_IMAGE_MODEL}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(text) => {
          setImage(text);
          setImageModel(text);
        }}
      />
      <Field
        testID="text-model"
        label={t('tryOn.textModel')}
        value={textModel}
        placeholder={DEFAULT_TEXT_MODEL}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(text) => {
          setText(text);
          setTextModel(text);
        }}
      />
      <AppText variant="caption" muted>
        {t('tryOn.modelHint')}
      </AppText>
    </View>
  );
}
