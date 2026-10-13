/** Only explicit capability errors; a bad image format or malformed prompt is not a model error. */
export function isUnsupportedModelMessage(message: string): boolean {
  const capability = '(?:model|response.?modalit|output.?modalit|structured.?output|image input)';
  const unsupported = '(?:not support|unsupported|does not support)';
  return new RegExp(`${capability}.*${unsupported}|${unsupported}.*${capability}`, 'i').test(
    message,
  );
}

export function geminiModelId(model: string): string {
  return model.trim().replace(/^models\//, '');
}
