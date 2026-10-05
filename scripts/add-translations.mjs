// Development helper: merges new keys into both translation files.
//   node scripts/add-translations.mjs path/to/patch.json
// The patch has the shape { "en": { ... }, "cs": { ... } }. Existing keys are overwritten.
import { readFileSync, writeFileSync } from 'node:fs';

const merge = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object') {
      target[key] = merge(
        target[key] && typeof target[key] === 'object' ? target[key] : {},
        value,
      );
    } else {
      target[key] = value;
    }
  }
  return target;
};

const patch = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const language of ['en', 'cs']) {
  const file = new URL(`../src/i18n/${language}.json`, import.meta.url);
  const merged = merge(JSON.parse(readFileSync(file, 'utf8')), patch[language] ?? {});
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
}
