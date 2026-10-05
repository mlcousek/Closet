import Anthropic from '@anthropic-ai/sdk';

import { AiUnavailableError, modelOptions, toUnavailable } from '../client';
import { checkAnthropicKey, checkGeminiKey } from '../providers';
import { normaliseTags, tagItem } from '../tagging';

jest.mock('expo-secure-store', () => ({}));
const mockSettings = new Map<string, string>();
jest.mock('@/db/settings', () => ({
  getSetting: (key: string) => mockSettings.get(key) ?? null,
  setSetting: jest.fn(),
}));
const mockGetKey = jest.fn();
jest.mock('../keys', () => ({ keyManager: { getKey: () => mockGetKey() } }));

const image = { base64: 'aGVsbG8=', mediaType: 'image/png' as const };

const goodOutput = {
  name: ' Pink pleated skirt ',
  category: 'bottoms' as const,
  subcategory: 'skirt' as const,
  colours: ['pink' as const, 'pink' as const, 'white' as const],
  seasons: ['summer' as const],
  occasions: ['party' as const, 'casual' as const],
  warmth: 2,
  brand: null,
};

const clientReturning = (response: object) => {
  const parse = jest.fn(async () => response);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
};

const apiError = <T extends new (...args: never[]) => Error>(type: T): Error =>
  Object.create(type.prototype) as Error;

beforeEach(() => {
  mockSettings.clear();
  mockGetKey.mockReset();
});

describe('item tagging', () => {
  it('sends the image with a schema-constrained request and returns cleaned tags', async () => {
    const { client, parse } = clientReturning({
      stop_reason: 'end_turn',
      parsed_output: goodOutput,
    });

    const tags = await tagItem(image, 'en', client);

    expect(tags).toEqual({
      name: 'Pink pleated skirt',
      category: 'bottoms',
      subcategory: 'skirt',
      colours: ['pink', 'white'],
      seasons: ['summer'],
      occasions: ['party', 'casual'],
      warmth: 2,
      brand: null,
    });
    const request = (parse.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.output_config.format).toBeDefined();
    expect(request.output_config.effort).toBe('low');
    expect(request.fallbacks).toBe('default');
    expect(request.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' },
    });
  });

  it('asks for the name in the interface language', async () => {
    const { client, parse } = clientReturning({
      stop_reason: 'end_turn',
      parsed_output: goodOutput,
    });
    await tagItem(image, 'cs', client);
    expect(((parse.mock.calls[0] as unknown[])[0] as { system: string }).system).toContain('Czech');
  });

  it('uses the model stored in settings and leaves out options Haiku rejects', async () => {
    mockSettings.set('ai.model.text', 'claude-haiku-4-5');
    const { client, parse } = clientReturning({
      stop_reason: 'end_turn',
      parsed_output: goodOutput,
    });
    await tagItem(image, 'en', client);
    const request = (parse.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(request.model).toBe('claude-haiku-4-5');
    expect(request.fallbacks).toBeUndefined();
    expect(request.output_config.effort).toBeUndefined();
  });

  it('drops values that do not fit together', () => {
    expect(
      normaliseTags({ ...goodOutput, subcategory: 'sneakers', warmth: 9, name: '  ', brand: ' ' }),
    ).toMatchObject({ subcategory: null, warmth: null, name: null, brand: null });
  });

  const reasonOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error instanceof AiUnavailableError ? error.reason : 'not-mapped';
    }
    return 'no-error';
  };

  it('reports a missing key without calling the provider', async () => {
    mockGetKey.mockResolvedValue(null);
    expect(await reasonOf(tagItem(image, 'en'))).toBe('noKey');
  });

  it.each([
    [Anthropic.AuthenticationError, 'rejectedKey'],
    [Anthropic.PermissionDeniedError, 'rejectedKey'],
    [Anthropic.RateLimitError, 'rateLimited'],
    [Anthropic.APIConnectionError, 'offline'],
    [Anthropic.InternalServerError, 'error'],
  ] as const)('maps %p to %s', async (type, reason) => {
    const client = {
      beta: { messages: { parse: jest.fn(async () => Promise.reject(apiError(type))) } },
    } as unknown as Anthropic;
    expect(await reasonOf(tagItem(image, 'en', client))).toBe(reason);
  });

  it('treats a refusal or an unparseable answer as unavailable', async () => {
    const refused = clientReturning({ stop_reason: 'refusal', parsed_output: null });
    expect(await reasonOf(tagItem(image, 'en', refused.client))).toBe('error');
    const empty = clientReturning({ stop_reason: 'end_turn', parsed_output: null });
    expect(await reasonOf(tagItem(image, 'en', empty.client))).toBe('error');
  });

  it('maps unknown failures to a generic reason', () => {
    expect(toUnavailable(new Error('boom')).reason).toBe('error');
    expect(toUnavailable(new AiUnavailableError('noKey')).reason).toBe('noKey');
  });

  it('adds effort and fallbacks only for models that accept them', () => {
    expect(modelOptions('claude-opus-5-5', 'low')).toMatchObject({
      effort: 'low',
      fallbacks: 'default',
    });
    expect(modelOptions('claude-haiku-4-5', 'low')).toEqual({ betas: [] });
  });
});

describe('provider key checks', () => {
  it('accepts an Anthropic key the provider lists models for', async () => {
    expect(await checkAnthropicKey('key', async () => ({}))).toBe('ok');
  });

  it('reports a rejected Anthropic key', async () => {
    const reject = (type: new (...args: never[]) => Error) => async () => {
      throw apiError(type);
    };
    expect(await checkAnthropicKey('key', reject(Anthropic.AuthenticationError))).toBe('rejected');
    expect(await checkAnthropicKey('key', reject(Anthropic.PermissionDeniedError))).toBe(
      'rejected',
    );
  });

  it('treats other Anthropic failures as unreachable', async () => {
    const fail = async () => {
      throw apiError(Anthropic.APIConnectionError);
    };
    expect(await checkAnthropicKey('key', fail)).toBe('unreachable');
  });

  it.each([
    [200, 'ok'],
    [400, 'rejected'],
    [401, 'rejected'],
    [403, 'rejected'],
    [429, 'unreachable'],
    [500, 'unreachable'],
  ])('maps Gemini HTTP %i to %s', async (status, expected) => {
    expect(await checkGeminiKey('key', async () => ({ status }))).toBe(expected);
  });

  it('sends the Gemini key in a header, never in the URL', async () => {
    const fetchMock = jest.fn(async () => ({ status: 200 }));
    await checkGeminiKey('secret-key', fetchMock);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: object }];
    expect(url).not.toContain('secret-key');
    expect(Object.values(init.headers)).toContain('secret-key');
  });

  it('treats a Gemini network failure as unreachable', async () => {
    const offline = async () => {
      throw new Error('offline');
    };
    expect(await checkGeminiKey('key', offline)).toBe('unreachable');
  });
});
