import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { openDb } from '@/db/client';
import { initI18n } from '@/i18n';
import { AddMenu } from '@/shell/AddMenu';
import { ToastHost } from '@/shell/ToastHost';
import { useTheme } from '@/theme/useTheme';

// The database must be open before anything renders: translations read the
// language override from it. Opening is synchronous and applies migrations.
openDb();
initI18n();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const theme = useTheme();
  const { t } = useTranslation();
  const base = theme.dark ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          value={{
            ...base,
            colors: {
              ...base.colors,
              background: theme.colors.background,
              card: theme.colors.surface,
              text: theme.colors.text,
              border: theme.colors.border,
              primary: theme.colors.primary,
            },
          }}
        >
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings/index" options={{ title: t('settings.title') }} />
            <Stack.Screen name="settings/ai-keys" options={{ title: t('ai.title') }} />
          </Stack>
          <AddMenu />
          <ToastHost />
          <StatusBar style="auto" />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
