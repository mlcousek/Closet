import * as SecureStore from 'expo-secure-store';

import { getSetting, setSetting } from '@/db/settings';

import { providers, type KeyCheck, type ProviderId } from './providers';

/** Where keys are kept. The default is the iOS keychain; tests pass an in-memory store. */
export type KeyStore = {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
};

export const secureKeyStore: KeyStore = {
  get: (name) => SecureStore.getItemAsync(name),
  set: (name, value) => SecureStore.setItemAsync(name, value),
  delete: (name) => SecureStore.deleteItemAsync(name),
};

/** Where the last known connection status is kept. It is not secret, so it lives in app settings. */
export type StatusStore = {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
};

const settingsStatusStore: StatusStore = { get: getSetting, set: setSetting };

export type KeyStatus = 'connected' | 'rejected' | 'untested';

export type KeyInfo = {
  provider: ProviderId;
  hasKey: boolean;
  /** The key with all but the last four characters hidden, or null without a key. */
  masked: string | null;
  status: KeyStatus;
};

const keyName = (provider: ProviderId) => `ai-key-${provider}`;
const statusName = (provider: ProviderId) => `ai.status.${provider}`;

export function maskKey(key: string): string {
  const visible = key.length > 8 ? key.slice(-4) : '';
  return `••••••••${visible}`;
}

export function createKeyManager(
  keyStore: KeyStore = secureKeyStore,
  statusStore: StatusStore = settingsStatusStore,
) {
  const readStatus = (provider: ProviderId): KeyStatus => {
    const stored = statusStore.get(statusName(provider));
    return stored === 'connected' || stored === 'rejected' ? stored : 'untested';
  };

  return {
    /** The raw key, for the AI module only. Never render this. */
    getKey(provider: ProviderId): Promise<string | null> {
      return keyStore.get(keyName(provider));
    },
    async getInfo(provider: ProviderId): Promise<KeyInfo> {
      const key = await keyStore.get(keyName(provider));
      return {
        provider,
        hasKey: !!key,
        masked: key ? maskKey(key) : null,
        status: key ? readStatus(provider) : 'untested',
      };
    },
    async saveKey(provider: ProviderId, key: string): Promise<void> {
      const trimmed = key.trim();
      if (!trimmed) throw new Error('Key is empty');
      await keyStore.set(keyName(provider), trimmed);
      statusStore.set(statusName(provider), null);
    },
    async removeKey(provider: ProviderId): Promise<void> {
      await keyStore.delete(keyName(provider));
      statusStore.set(statusName(provider), null);
    },
    /**
     * Asks the provider whether it accepts the stored key and remembers the answer.
     * An unreachable provider leaves the remembered status as it was.
     */
    async testKey(provider: ProviderId): Promise<KeyCheck> {
      const key = await keyStore.get(keyName(provider));
      if (!key) return 'rejected';
      const result = await providers[provider].validateKey(key);
      if (result === 'ok') statusStore.set(statusName(provider), 'connected');
      if (result === 'rejected') statusStore.set(statusName(provider), 'rejected');
      return result;
    },
  };
}

export const keyManager = createKeyManager();
