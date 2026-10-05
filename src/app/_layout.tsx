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
          <Stack
            // Only the display turns with the phone; everything else is laid out for portrait.
            screenOptions={{ headerBackButtonDisplayMode: 'minimal', orientation: 'portrait' }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen name="profile/edit" options={{ title: t('profile.editTitle') }} />
            <Stack.Screen name="item/new" options={{ title: t('addItem.title') }} />
            <Stack.Screen name="item/[id]" options={{ title: t('item.title') }} />
            <Stack.Screen name="item/link" options={{ title: t('linkImport.title') }} />
            <Stack.Screen name="import/index" options={{ title: t('importFlow.title') }} />
            <Stack.Screen name="import/review" options={{ title: t('importFlow.reviewTitle') }} />
            <Stack.Screen name="lookbook/[id]" options={{ title: t('lookbooks.title') }} />
            <Stack.Screen name="outfit/[id]" options={{ title: t('outfits.title') }} />
            <Stack.Screen
              name="outfit/edit"
              // The editor asks before discarding changes, which a swipe back would skip.
              options={{ title: t('outfitEditor.newTitle'), gestureEnabled: false }}
            />
            <Stack.Screen name="stylist" options={{ title: t('stylist.title') }} />
            <Stack.Screen name="stats" options={{ title: t('stats.title') }} />
            <Stack.Screen name="trips/index" options={{ title: t('trips.title') }} />
            <Stack.Screen name="trips/[id]" options={{ title: t('trips.tripTitle') }} />
            <Stack.Screen
              name="display"
              options={{ headerShown: false, orientation: 'all', animation: 'fade' }}
            />
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
