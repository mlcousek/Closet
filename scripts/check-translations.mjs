// Fails when a translation key exists in one language and not the other.
import { readFileSync } from 'node:fs';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../src/i18n/${name}.json`, import.meta.url), 'utf8'));

const flatten = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );

const en = new Set(flatten(load('en')));
const cs = new Set(flatten(load('cs')));
const missingInCs = [...en].filter((key) => !cs.has(key));
const missingInEn = [...cs].filter((key) => !en.has(key));

for (const key of missingInCs) console.error(`Missing in cs.json: ${key}`);
for (const key of missingInEn) console.error(`Missing in en.json: ${key}`);

if (missingInCs.length || missingInEn.length) process.exit(1);
console.log(`Translations complete: ${en.size} keys in both languages.`);
