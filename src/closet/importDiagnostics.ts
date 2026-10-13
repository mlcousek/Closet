import { AiUnavailableError } from '@/ai/client';

export const IMPORT_REASONS = [
  'copyPhoto',
  'readPhoto',
  'savePhoto',
  'duplicate',
  'interrupted',
  'offline',
  'rateLimited',
  'modelUnavailable',
  'unsupportedModel',
  'tagging',
  'error',
] as const;
export type ImportReason = (typeof IMPORT_REASONS)[number];

export class ImportPhotoError extends Error {
  constructor(
    public reason: ImportReason,
    public duplicateItemId: string | null = null,
    cause?: unknown,
  ) {
    super(
      cause instanceof Error
        ? cause.message
        : `import:${reason}${duplicateItemId ? `:${duplicateItemId}` : ''}`,
    );
  }
}

/** Persist safe reason codes, never raw provider payloads, keys or device paths. */
export function importFailure(error: unknown): string {
  if (error instanceof ImportPhotoError)
    return `import:${error.reason}${error.duplicateItemId ? `:${error.duplicateItemId}` : ''}`;
  if (error instanceof AiUnavailableError) {
    return `import:${IMPORT_REASONS.includes(error.reason as ImportReason) ? error.reason : 'tagging'}`;
  }
  return 'import:error';
}

/** Reads both current reason codes and errors left by older app versions. */
export function importDiagnostic(error: string | null): {
  reason: ImportReason;
  duplicateItemId: string | null;
} {
  const parts = (error ?? '').split(':');
  const reason =
    parts[0] === 'import'
      ? parts[1]
      : error === 'interrupted'
        ? 'interrupted'
        : error?.startsWith('AI unavailable: ')
          ? error.slice('AI unavailable: '.length)
          : 'error';
  return {
    reason: IMPORT_REASONS.includes(reason as ImportReason) ? (reason as ImportReason) : 'error',
    duplicateItemId: reason === 'duplicate' ? parts[2] || null : null,
  };
}
