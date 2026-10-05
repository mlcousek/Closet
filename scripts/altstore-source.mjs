// Prints an AltStore source document for a release, so AltStore on the phone
// can find and install new versions. Usage:
//   node scripts/altstore-source.mjs --ipa Closet.ipa --version 0.1.0 --build 12 \
//     --repo owner/name --tag v0.1.0
import { statSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((value, index, all) => (value.startsWith('--') ? [value.slice(2), all[index + 1]] : null))
    .filter(Boolean),
);

for (const required of ['ipa', 'version', 'build', 'repo', 'tag']) {
  if (!args[required]) {
    console.error(`Missing --${required}`);
    process.exit(1);
  }
}

const base = `https://github.com/${args.repo}`;

const source = {
  name: 'Closet',
  identifier: 'cz.mlcousek.closet.source',
  sourceURL: `${base}/releases/latest/download/altstore-source.json`,
  apps: [
    {
      name: 'Closet',
      bundleIdentifier: 'cz.mlcousek.closet',
      developerName: args.repo.split('/')[0],
      subtitle: 'Your wardrobe, on you.',
      localizedDescription:
        'A personal digital wardrobe: photograph your clothes, build outfits, see them on your own photo and plan what to wear.',
      iconURL: `${base}/raw/${args.tag}/assets/images/icon.png`,
      tintColor: '8B5CF6',
      versions: [
        {
          version: args.version,
          buildVersion: String(args.build),
          date: new Date().toISOString(),
          downloadURL: `${base}/releases/download/${args.tag}/Closet.ipa`,
          size: statSync(args.ipa).size,
          minOSVersion: '16.4',
        },
      ],
    },
  ],
};

console.log(JSON.stringify(source, null, 2));
