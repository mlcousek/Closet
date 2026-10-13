# Closet

A personal digital wardrobe for iPhone, built with React Native and Expo. Photograph clothes, build layered outfits, plan what to wear and track the pieces you actually wear.

## Available features

- Wardrobe: camera and photo imports, bulk review, on-device background removal, optional AI tagging, shop-link import, search and filters.
- Outfits: two visible top rows for a base top and hoodie or sweater, separate outerwear, additional layers and accessories, saved outfits and lookbooks.
- Try-on: optional Gemini rendering with your own API key, or sharing an outfit sheet to an assistant app and importing the finished picture.
- Planning: weather suggestions, outfit calendar, wear history and local reminders.
- Insights: wardrobe statistics, cost per wear, AI stylist, trip packing and display mode.
- Local SQLite storage, backup export and restore, English and Czech, light and dark appearance.

First-run setup asks only for a name and opens the wardrobe. Gender, body type, sizes and an avatar remain optional in Profile. No AI key is required to organise clothes or build outfits.

## Development and checks

```bash
npm ci
npm run check
npm start
```

`npm run check` runs ESLint, TypeScript, translation validation and Jest. Tests cover repositories, screens, queues, backups and provider response handling. Native camera, Vision, sharing and notifications are mocked in automated tests; passing tests do not establish device behavior or live AI output quality.

See [building and installing](docs/building.md) for the Windows / GitHub Actions / AltStore workflow.

## Current engineering status

All seven original feature areas have implementations. The OpenSpec folders are the original implementation and verification checklist, not a list of wholly unbuilt features. Read [current status](docs/status.md) for the distinction between implemented behavior, design changes and outstanding validation, and [decisions](docs/decisions.md) for tradeoffs.

Startup waits for database recovery before mounting wardrobe screens. A failed recovery shows a retry screen. Bulk-import review explicitly enables review of the next item, so repeated Confirm or Discard taps cannot act on an unseen item.

Clothes and outfits live on the device. AI operations send the relevant text and images to the chosen provider using keys stored in the device keychain. Keys are excluded from backups.
