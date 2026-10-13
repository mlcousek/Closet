import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button } from '@/components/ui';

import { checkConfiguredModel, type ModelCheck } from './modelCheck';
import type { ProviderId } from './providers';
import { useKeyInfo } from './useKeyInfo';

/** Remount when the model changes so an old check cannot describe a new selection. */
export function ModelCheckButton({ provider, model }: { provider: ProviderId; model: string }) {
  const { data: info } = useKeyInfo(provider);
  return (
    <ModelCheckSession
      key={`${info?.hasKey}:${info?.masked}`}
      provider={provider}
      model={model}
      ready={info !== undefined}
    />
  );
}

function ModelCheckSession({
  provider,
  model,
  ready,
}: {
  provider: ProviderId;
  model: string;
  ready: boolean;
}) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ModelCheck | null>(null);
  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkConfiguredModel(provider, model));
    } catch {
      setResult('error');
    } finally {
      setChecking(false);
    }
  };
  return (
    <View>
      <Button
        testID={`check-model-${provider}`}
        label={t('ai.modelCheck.check')}
        kind="secondary"
        loading={checking}
        disabled={!ready}
        onPress={() => void check()}
      />
      {result ? (
        <AppText testID={`model-result-${provider}`} muted>
          {t(
            result === 'available'
              ? `ai.modelCheck.available.${provider}`
              : `ai.modelCheck.${result}`,
          )}
        </AppText>
      ) : null}
    </View>
  );
}
