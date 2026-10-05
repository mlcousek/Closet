import { createKeyManager, maskKey, type KeyStore, type StatusStore } from '../keys';
import { providers } from '../providers';

jest.mock('expo-secure-store', () => ({}));
jest.mock('@/db/settings', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));

const memoryStores = () => {
  const keys = new Map<string, string>();
  const statuses = new Map<string, string>();
  const keyStore: KeyStore = {
    get: async (name) => keys.get(name) ?? null,
    set: async (name, value) => void keys.set(name, value),
    delete: async (name) => void keys.delete(name),
  };
  const statusStore: StatusStore = {
    get: (key) => statuses.get(key) ?? null,
    set: (key, value) => void (value === null ? statuses.delete(key) : statuses.set(key, value)),
  };
  return { keys, statuses, manager: createKeyManager(keyStore, statusStore) };
};

describe('key manager', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports no key before one is saved', async () => {
    const { manager } = memoryStores();
    expect(await manager.getInfo('anthropic')).toEqual({
      provider: 'anthropic',
      hasKey: false,
      masked: null,
      status: 'untested',
    });
  });

  it('stores a trimmed key and only ever exposes it masked', async () => {
    const { manager, keys } = memoryStores();
    await manager.saveKey('anthropic', '  sk-ant-secret-value-1234  ');

    expect(keys.get('ai-key-anthropic')).toBe('sk-ant-secret-value-1234');
    const info = await manager.getInfo('anthropic');
    expect(info).toMatchObject({ hasKey: true, masked: '••••••••1234', status: 'untested' });
    expect(JSON.stringify(info)).not.toContain('secret');
  });

  it('rejects an empty key', async () => {
    const { manager } = memoryStores();
    await expect(manager.saveKey('anthropic', '   ')).rejects.toThrow();
  });

  it('keeps providers separate', async () => {
    const { manager } = memoryStores();
    await manager.saveKey('anthropic', 'key-for-anthropic');
    expect((await manager.getInfo('image')).hasKey).toBe(false);
  });

  it('marks the provider connected when it accepts the key', async () => {
    const { manager } = memoryStores();
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('ok');
    await manager.saveKey('anthropic', 'key-for-anthropic');

    expect(await manager.testKey('anthropic')).toBe('ok');
    expect((await manager.getInfo('anthropic')).status).toBe('connected');
  });

  it('marks the provider rejected when it refuses the key', async () => {
    const { manager } = memoryStores();
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('rejected');
    await manager.saveKey('anthropic', 'key-for-anthropic');

    expect(await manager.testKey('anthropic')).toBe('rejected');
    expect((await manager.getInfo('anthropic')).status).toBe('rejected');
  });

  it('keeps the previous status when the provider is unreachable', async () => {
    const { manager } = memoryStores();
    const validate = jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('ok');
    await manager.saveKey('anthropic', 'key-for-anthropic');
    await manager.testKey('anthropic');

    validate.mockResolvedValue('unreachable');
    expect(await manager.testKey('anthropic')).toBe('unreachable');
    expect((await manager.getInfo('anthropic')).status).toBe('connected');
  });

  it('resets the status when the key is replaced', async () => {
    const { manager } = memoryStores();
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('ok');
    await manager.saveKey('anthropic', 'key-for-anthropic');
    await manager.testKey('anthropic');

    await manager.saveKey('anthropic', 'another-key-5678');
    expect((await manager.getInfo('anthropic')).status).toBe('untested');
  });

  it('removes the key and its status', async () => {
    const { manager, keys, statuses } = memoryStores();
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('ok');
    await manager.saveKey('anthropic', 'key-for-anthropic');
    await manager.testKey('anthropic');

    await manager.removeKey('anthropic');

    expect(keys.size).toBe(0);
    expect(statuses.size).toBe(0);
    expect(await manager.getKey('anthropic')).toBeNull();
  });
});

describe('maskKey', () => {
  it('shows only the last four characters', () => {
    expect(maskKey('sk-ant-abcdefgh1234')).toBe('••••••••1234');
  });

  it('shows nothing of a very short key', () => {
    expect(maskKey('short')).toBe('••••••••');
  });
});
