import type { ModelInfo } from '@anthropic-ai/sdk/resources/models';

import { createAnthropic, toUnavailable } from './client';
import { keyManager } from './keys';
import { geminiModelId } from './modelFailure';
import type { ProviderId } from './providers';
import { isInvalidKey } from './tryOn';

type TextModelInfo = {
  capabilities: Pick<
    NonNullable<ModelInfo['capabilities']>,
    'image_input' | 'structured_outputs'
  > | null;
};

export type ModelCheck =
  | 'supported'
  | 'available'
  | 'unsupportedModel'
  | 'modelUnavailable'
  | 'noKey'
  | 'rejectedKey'
  | 'rateLimited'
  | 'unreachable'
  | 'error';

/** Metadata only: no garment photos or generation request are sent. */
export async function checkAnthropicModel(
  model: string,
  key: string,
  retrieve: (model: string, key: string) => Promise<TextModelInfo> = (id, apiKey) =>
    createAnthropic(apiKey).models.retrieve(id),
): Promise<ModelCheck> {
  try {
    const { capabilities } = await retrieve(model.trim(), key);
    if (!capabilities) return 'available';
    if (
      capabilities.image_input?.supported === false ||
      capabilities.structured_outputs?.supported === false
    ) {
      return 'unsupportedModel';
    }
    return capabilities.image_input?.supported === true &&
      capabilities.structured_outputs?.supported === true
      ? 'supported'
      : 'available';
  } catch (error) {
    const reason = toUnavailable(error).reason;
    return reason === 'offline' ? 'unreachable' : reason;
  }
}

type FetchModel = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<{ status: number; json(): Promise<unknown> }>;

/** Gemini metadata confirms generateContent access, but does not advertise image output. */
export async function checkGeminiModel(
  model: string,
  key: string,
  fetchImpl: FetchModel = (url, init) => fetch(url, init),
  timeoutMs = 15_000,
): Promise<ModelCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModelId(model))}`,
      { method: 'GET', headers: { 'x-goog-api-key': key }, signal: controller.signal },
    );
    const payload = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403 || isInvalidKey(payload))
      return 'rejectedKey';
    if (response.status === 404) return 'modelUnavailable';
    if (response.status === 429) return 'rateLimited';
    if (response.status < 200 || response.status >= 300) return 'error';
    const methods = (payload as { supportedGenerationMethods?: unknown } | null)
      ?.supportedGenerationMethods;
    if (!Array.isArray(methods) || !methods.every((method) => typeof method === 'string'))
      return 'error';
    return methods.includes('generateContent') ? 'available' : 'unsupportedModel';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

export async function checkConfiguredModel(
  provider: ProviderId,
  model: string,
): Promise<ModelCheck> {
  try {
    const key = await keyManager.getKey(provider);
    if (!key) return 'noKey';
    return provider === 'anthropic'
      ? checkAnthropicModel(model, key)
      : checkGeminiModel(model, key);
  } catch {
    return 'error';
  }
}
