import { act } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import cs from './src/i18n/cs.json';
import en from './src/i18n/en.json';
import { useToast } from './src/shell/toast';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text> };
});

// Query results arrive asynchronously; route their re-renders through act.
notifyManager.setNotifyFunction((notify) => void act(notify));

// Component tests render real English strings so assertions read like the screen.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, cs: { translation: cs } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

afterEach(async () => {
  // Clears the pending auto-hide timer so workers can exit.
  useToast.getState().dismiss();
  if (i18n.language !== 'en') await act(() => i18n.changeLanguage('en'));
});
