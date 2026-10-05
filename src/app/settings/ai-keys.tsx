import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { keyManager } from '@/ai/keys';
import { PROVIDER_IDS, type ProviderId } from '@/ai/providers';
import { useKeyInfo, useRefreshKeyInfo } from '@/ai/useKeyInfo';
import { AppText, Button, Screen } from '@/components/ui';
import { RenderSettings } from '@/outfits/RenderSettings';
import { useTheme } from '@/theme/useTheme';

function ProviderCard({ provider }: { provider: ProviderId }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const { data: info } = useKeyInfo(provider);
  const refresh = useRefreshKeyInfo();
  const [draft, setDraft] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await keyManager.saveKey(provider, draft);
      setDraft('');
    } catch {
      setError(t('common.somethingWentWrong'));
    }
    await refresh(provider);
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    try {
      const result = await keyManager.testKey(provider);
      if (result === 'rejected') setError(t('ai.rejected'));
      if (result === 'unreachable') setError(t('ai.testFailed'));
      await refresh(provider);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setTesting(false);
    }
  };

  const remove = () => {
    Alert.alert(t('ai.removeConfirmTitle'), t('ai.removeConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => {
          void keyManager.removeKey(provider).then(() => {
            setError(null);
            return refresh(provider);
          });
        },
      },
    ]);
  };

  const statusLabel =
    info?.status === 'connected'
      ? t('ai.connected')
      : info?.status === 'rejected'
        ? t('ai.notConnected')
        : t('ai.notTested');
  const statusColor =
    info?.status === 'connected'
      ? colors.success
      : info?.status === 'rejected'
        ? colors.danger
        : colors.textMuted;

  return (
    <View
      testID={`provider-${provider}`}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View>
        <AppText variant="heading">{t(`ai.providers.${provider}.name`)}</AppText>
        <AppText muted>{t(`ai.providers.${provider}.purpose`)}</AppText>
      </View>

      {info?.hasKey ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText testID={`masked-${provider}`}>{info.masked}</AppText>
            <AppText testID={`status-${provider}`} variant="label" style={{ color: statusColor }}>
              {statusLabel}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              testID={`test-${provider}`}
              label={t('ai.test')}
              kind="secondary"
              loading={testing}
              onPress={() => void test()}
            />
            <Button
              testID={`remove-${provider}`}
              label={t('common.remove')}
              kind="danger"
              onPress={remove}
            />
          </View>
        </>
      ) : (
        <>
          <TextInput
            testID={`input-${provider}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('ai.keyPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={{
              color: colors.text,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.sm,
              padding: spacing.md,
            }}
          />
          <Button
            testID={`save-${provider}`}
            label={t('common.save')}
            disabled={!draft.trim()}
            onPress={() => void save()}
          />
        </>
      )}

      {error ? (
        <AppText testID={`error-${provider}`} style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export default function AiKeysScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Screen scroll edges={[]} style={{ gap: spacing.lg, paddingTop: spacing.lg }}>
      <AppText muted>{t('ai.intro')}</AppText>
      {PROVIDER_IDS.map((provider) => (
        <ProviderCard key={provider} provider={provider} />
      ))}
      <RenderSettings />
    </Screen>
  );
}
