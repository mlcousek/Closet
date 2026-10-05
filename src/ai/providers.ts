import Anthropic from '@anthropic-ai/sdk';

export const PROVIDER_IDS = ['anthropic', 'image'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Outcome of asking a provider whether it accepts a key. */
export type KeyCheck = 'ok' | 'rejected' | 'unreachable';

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ status: number }>;

export type Provider = {
  id: ProviderId;
  /** Makes a cheap authenticated request that has no side effects and costs nothing. */
  validateKey(key: string): Promise<KeyCheck>;
};

/** Lists one model with the key; the cheapest call that proves the key works. */
export async function checkAnthropicKey(
  key: string,
  listModels: (key: string) => Promise<unknown> = (apiKey) =>
    new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 }).models.list({
      limit: 1,
    }),
): Promise<KeyCheck> {
  try {
    await listModels(key);
    return 'ok';
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return 'rejected';
    }
    return 'unreachable';
  }
}

/** Lists one Gemini model with the key, sent in a header so it never appears in a URL. */
export async function checkGeminiKey(
  key: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<KeyCheck> {
  try {
    const response = await fetchImpl(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      { method: 'GET', headers: { 'x-goog-api-key': key } },
    );
    if (response.status >= 200 && response.status < 300) return 'ok';
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return 'rejected';
    }
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export const providers: Record<ProviderId, Provider> = {
  anthropic: { id: 'anthropic', validateKey: (key) => checkAnthropicKey(key) },
  image: { id: 'image', validateKey: (key) => checkGeminiKey(key) },
};
