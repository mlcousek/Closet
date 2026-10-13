import Anthropic from '@anthropic-ai/sdk';

import { checkAnthropicModel, checkConfiguredModel, checkGeminiModel } from '../modelCheck';

const mockGetKey = jest.fn();
jest.mock('../keys', () => ({
  keyManager: { getKey: (...args: unknown[]) => mockGetKey(...args) },
}));
jest.mock('@/db/settings', () => ({ getSetting: () => null, setSetting: jest.fn() }));

beforeEach(() => mockGetKey.mockReset());

describe('Claude model metadata', () => {
  it.each([
    [true, true, 'supported'],
    [false, true, 'unsupportedModel'],
    [true, false, 'unsupportedModel'],
  ])('checks photo input %s and structured responses %s', async (image, structured, result) => {
    const retrieve = jest.fn(async () => ({
      capabilities: {
        image_input: { supported: image as boolean },
        structured_outputs: { supported: structured as boolean },
      },
    }));
    expect(await checkAnthropicModel(' selected-model ', 'private-key', retrieve)).toBe(result);
    expect(retrieve).toHaveBeenCalledWith('selected-model', 'private-key');
  });

  it('does not claim capabilities when metadata is missing', async () => {
    expect(await checkAnthropicModel('m', 'k', async () => ({ capabilities: null }))).toBe(
      'available',
    );
  });

  it.each([
    [Anthropic.NotFoundError, 'modelUnavailable'],
    [Anthropic.AuthenticationError, 'rejectedKey'],
    [Anthropic.PermissionDeniedError, 'rejectedKey'],
    [Anthropic.RateLimitError, 'rateLimited'],
    [Anthropic.APIConnectionError, 'unreachable'],
  ] as const)('maps %p to %s', async (type, result) => {
    expect(
      await checkAnthropicModel('m', 'k', async () => {
        throw Object.create(type.prototype);
      }),
    ).toBe(result);
  });
});

const respond = (status: number, payload: unknown) =>
  jest.fn(async () => ({
    status,
    json: async () => payload,
  }));

describe('Gemini model metadata', () => {
  it('checks the configured model without generating content or exposing the key in the URL', async () => {
    const fetch = respond(200, { supportedGenerationMethods: ['generateContent', 'countTokens'] });
    expect(await checkGeminiModel(' models/image-model ', 'private-key', fetch)).toBe('available');
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body?: string;
      },
    ];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/image-model');
    expect(url).not.toContain('private-key');
    expect(init.method).toBe('GET');
    expect(init.headers['x-goog-api-key']).toBe('private-key');
    expect(init.body).toBeUndefined();
  });

  it.each([
    [200, { supportedGenerationMethods: ['embedContent'] }, 'unsupportedModel'],
    [200, {}, 'error'],
    [200, { supportedGenerationMethods: 'generateContent' }, 'error'],
    [404, {}, 'modelUnavailable'],
    [401, {}, 'rejectedKey'],
    [403, {}, 'rejectedKey'],
    [429, {}, 'rateLimited'],
    [400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 'rejectedKey'],
    [400, {}, 'error'],
    [500, {}, 'error'],
  ] as const)('maps metadata response %i to expected result', async (status, payload, result) => {
    expect(await checkGeminiModel('m', 'k', respond(status, payload))).toBe(result);
  });

  it('times out a check and releases its timer', async () => {
    jest.useFakeTimers();
    try {
      const pending = checkGeminiModel(
        'm',
        'k',
        async (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error('abort'))),
          ),
        100,
      );
      await jest.advanceTimersByTimeAsync(100);
      expect(await pending).toBe('unreachable');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

it('requires a saved key without contacting either provider', async () => {
  mockGetKey.mockResolvedValue(null);
  expect(await checkConfiguredModel('image', 'm')).toBe('noKey');
  expect(await checkConfiguredModel('anthropic', 'm')).toBe('noKey');
  expect(mockGetKey.mock.calls).toEqual([['image'], ['anthropic']]);
});
