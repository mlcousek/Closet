import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import AiKeysScreen from '@/app/settings/ai-keys';

import { KeyNeededPrompt } from '../KeyNeededPrompt';
import { providers } from '../providers';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (name: string) => mockSecure.get(name) ?? null,
  setItemAsync: async (name: string, value: string) => void mockSecure.set(name, value),
  deleteItemAsync: async (name: string) => void mockSecure.delete(name),
}));

const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: (key: string, value: string | null) =>
    void (value === null ? mockSettings.delete(key) : mockSettings.set(key, value)),
}));

const renderWithQuery = (ui: ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockSecure.clear();
  mockSettings.clear();
  mockPush.mockClear();
  jest.restoreAllMocks();
});

describe('AI key settings', () => {
  it('saves a key and shows it masked from then on', async () => {
    renderWithQuery(<AiKeysScreen />);
    fireEvent.changeText(await screen.findByTestId('input-anthropic'), 'sk-ant-secret-1234');
    fireEvent.press(screen.getByTestId('save-anthropic'));

    expect(await screen.findByTestId('masked-anthropic')).toHaveTextContent('••••••••1234');
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(screen.getByTestId('status-anthropic')).toHaveTextContent('Not tested');
    expect(mockSecure.get('ai-key-anthropic')).toBe('sk-ant-secret-1234');
  });

  it('cannot save an empty key', async () => {
    renderWithQuery(<AiKeysScreen />);
    fireEvent.changeText(await screen.findByTestId('input-anthropic'), '   ');
    expect(screen.getByTestId('save-anthropic')).toBeDisabled();
  });

  it('shows the provider as connected after a successful test', async () => {
    mockSecure.set('ai-key-anthropic', 'sk-ant-secret-1234');
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('ok');
    renderWithQuery(<AiKeysScreen />);

    fireEvent.press(await screen.findByTestId('test-anthropic'));

    await waitFor(() =>
      expect(screen.getByTestId('status-anthropic')).toHaveTextContent('Connected'),
    );
    expect(screen.queryByTestId('error-anthropic')).toBeNull();
  });

  it('explains a rejected key and shows the provider as not connected', async () => {
    mockSecure.set('ai-key-anthropic', 'sk-ant-wrong-1234');
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('rejected');
    renderWithQuery(<AiKeysScreen />);

    fireEvent.press(await screen.findByTestId('test-anthropic'));

    expect(await screen.findByTestId('error-anthropic')).toHaveTextContent(/rejected this key/);
    await waitFor(() =>
      expect(screen.getByTestId('status-anthropic')).toHaveTextContent('Not connected'),
    );
  });

  it('says so when the provider cannot be reached', async () => {
    mockSecure.set('ai-key-anthropic', 'sk-ant-secret-1234');
    jest.spyOn(providers.anthropic, 'validateKey').mockResolvedValue('unreachable');
    renderWithQuery(<AiKeysScreen />);

    fireEvent.press(await screen.findByTestId('test-anthropic'));

    expect(await screen.findByTestId('error-anthropic')).toHaveTextContent(/could not be reached/);
  });

  it('removes a key after confirmation', async () => {
    mockSecure.set('ai-key-anthropic', 'sk-ant-secret-1234');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    renderWithQuery(<AiKeysScreen />);

    fireEvent.press(await screen.findByTestId('remove-anthropic'));

    expect(alert).toHaveBeenCalled();
    expect(await screen.findByTestId('input-anthropic')).toBeTruthy();
    expect(mockSecure.has('ai-key-anthropic')).toBe(false);
  });

  it('keeps the key when removal is cancelled', async () => {
    mockSecure.set('ai-key-anthropic', 'sk-ant-secret-1234');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderWithQuery(<AiKeysScreen />);

    fireEvent.press(await screen.findByTestId('remove-anthropic'));

    expect(mockSecure.has('ai-key-anthropic')).toBe(true);
    expect(screen.getByTestId('masked-anthropic')).toBeTruthy();
  });
});

describe('key needed prompt', () => {
  it('names the provider and links to the key settings', () => {
    render(<KeyNeededPrompt provider="image" />);
    expect(screen.getByText(/This feature uses Google Gemini/)).toBeTruthy();
    fireEvent.press(screen.getByText('Open key settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings/ai-keys');
  });
});
