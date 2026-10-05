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
  validateKey(key: string, fetchImpl?: FetchLike): Promise<KeyCheck>;
};

async function check(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<KeyCheck> {
  try {
    const response = await fetchImpl(url, { method: 'GET', headers });
    if (response.status >= 200 && response.status < 300) return 'ok';
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return 'rejected';
    }
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

export const providers: Record<ProviderId, Provider> = {
  anthropic: {
    id: 'anthropic',
    validateKey: (key, fetchImpl = defaultFetch) =>
      check(fetchImpl, 'https://api.anthropic.com/v1/models?limit=1', {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      }),
  },
  image: {
    id: 'image',
    validateKey: (key, fetchImpl = defaultFetch) =>
      check(fetchImpl, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
        'x-goog-api-key': key,
      }),
  },
};
