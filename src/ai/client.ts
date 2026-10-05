import Anthropic from '@anthropic-ai/sdk';

import { getSetting, setSetting } from '@/db/settings';

import { keyManager } from './keys';

export const DEFAULT_TEXT_MODEL = 'claude-opus-5-5';
const TEXT_MODEL_SETTING = 'ai.model.text';

/** Why an AI feature could not produce a result. Features show one message per reason. */
export type AiUnavailableReason = 'noKey' | 'offline' | 'rejectedKey' | 'rateLimited' | 'error';

export class AiUnavailableError extends Error {
  constructor(public reason: AiUnavailableReason) {
    super(`AI unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}

/** The Claude model used for tagging and styling. Stored so it can change without an app update. */
export function getTextModel(): string {
  return getSetting(TEXT_MODEL_SETTING) ?? DEFAULT_TEXT_MODEL;
}

export function setTextModel(model: string | null): void {
  setSetting(TEXT_MODEL_SETTING, model?.trim() || null);
}

/**
 * A client for the user's own Anthropic key. The key is theirs and stays on
 * their device, which is the case `dangerouslyAllowBrowser` exists for; before
 * a public release this module is pointed at a proxy instead.
 */
export function createAnthropic(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

export async function getAnthropic(): Promise<Anthropic> {
  const key = await keyManager.getKey('anthropic');
  if (!key) throw new AiUnavailableError('noKey');
  return createAnthropic(key);
}

/** Turns any failure of a Claude request into one of the reasons the interface can explain. */
export function toUnavailable(error: unknown): AiUnavailableError {
  if (error instanceof AiUnavailableError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiUnavailableError('rejectedKey');
  }
  if (error instanceof Anthropic.RateLimitError) return new AiUnavailableError('rateLimited');
  if (error instanceof Anthropic.APIConnectionError) return new AiUnavailableError('offline');
  return new AiUnavailableError('error');
}

/**
 * Request options that depend on the model. Effort and server-side refusal
 * fallbacks exist on the current Opus, Sonnet and Fable models but are
 * rejected by Haiku 4.5.
 */
export function modelOptions(model: string, effort: 'low' | 'medium' | 'high') {
  if (model.startsWith('claude-haiku')) return { betas: [] as string[] };
  return {
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
    effort,
  };
}
