import { getLocales } from 'expo-localization';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import cs from '@/i18n/cs.json';
import en from '@/i18n/en.json';

/** No database-backed UI mounts until opening and recovery both succeed. */
export function StartupGate({
  prepare,
  children,
}: {
  prepare: () => Promise<void>;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const copy = getLocales()[0]?.languageCode === 'cs' ? cs : en;
  useEffect(() => {
    let active = true;
    prepare()
      .then(() => {
        if (active) setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [prepare, attempt]);
  if (state === 'ready') return children;
  return (
    <View style={styles.screen}>
      {state === 'loading' ? (
        <>
          <ActivityIndicator />
          <Text>{copy.startup.loading}</Text>
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.startup.title}
          </Text>
          <Text style={styles.message}>{copy.startup.message}</Text>
          <Pressable
            testID="startup-retry"
            accessibilityRole="button"
            style={styles.button}
            onPress={() => {
              setState('loading');
              setAttempt((value) => value + 1);
            }}
          >
            <Text style={styles.buttonText}>{copy.common.retry}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#FBF9FD',
  },
  title: { fontSize: 20, fontWeight: '600', color: '#1B1622', textAlign: 'center' },
  message: { fontSize: 16, color: '#1B1622', textAlign: 'center' },
  button: { backgroundColor: '#1B1622', borderRadius: 24, padding: 16 },
  buttonText: { color: '#FFFFFF', fontSize: 16 },
});
