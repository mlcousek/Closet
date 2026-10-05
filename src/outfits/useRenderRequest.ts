import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/shell/toast';

import { isDisclosed, requestRender, setDisclosed } from './renderActions';
import type { Outfit } from './repository';

/** Asks once, before the first render, whether the photo and item images may go to the provider. */
function confirmDisclosure(t: (key: string) => string): Promise<boolean> {
  if (isDisclosed()) return Promise.resolve(true);
  return new Promise((resolve) => {
    Alert.alert(t('tryOn.disclosureTitle'), t('tryOn.disclosureMessage'), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      {
        text: t('tryOn.disclosureAccept'),
        onPress: () => {
          setDisclosed();
          resolve(true);
        },
      },
    ]);
  });
}

/**
 * Returns a function that requests a try-on render of an outfit, after the
 * one-time disclosure, and tells the user when an avatar photo is missing.
 */
export function useRenderRequest() {
  const { t } = useTranslation();
  const router = useRouter();
  const showToast = useToast((state) => state.show);

  return async (outfit: Outfit, force = false): Promise<void> => {
    if (!(await confirmDisclosure(t))) return;
    const outcome = await requestRender(outfit, force);
    if (outcome.kind === 'skipped' && outcome.reason === 'noAvatar') {
      showToast({
        message: t('tryOn.noAvatar'),
        actionLabel: t('tryOn.addAvatar'),
        onAction: () => router.push('/profile/edit'),
      });
    }
  };
}
