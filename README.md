# Closet (working name)

A personal digital wardrobe for iPhone: photograph your clothes, build outfits, see them rendered on your own photo, plan what to wear by weather and calendar.

Inspired by the Alta closet app. Built with React Native + Expo, developed on Windows, built in GitHub Actions and sideloaded with AltStore.

## Plan

The app is planned as seven OpenSpec changes, implemented in order. Each lives in `openspec/changes/<name>/` with a proposal, specs, design and tasks.

| # | Change | Delivers |
|---|--------|----------|
| 1 | `add-app-foundation` | Expo project, tab navigation, local database, EN/CS localisation, AI key settings, GitHub Actions IPA build |
| 2 | `add-profile-onboarding` | Gender, body type, full-body photo used as the avatar |
| 3 | `add-closet` | Clothing items: photo capture, automatic cutout, AI tagging, bulk import, import from shop link, search and filters |
| 4 | `add-outfits-try-on` | Outfit editor with per-slot carousels, AI try-on render on the avatar, saved outfits grid |
| 5 | `add-lookbooks-wishlist-sharing` | Lookbooks, wishlist items usable in outfits, share outfit as image |
| 6 | `add-planning-weather` | Home screen, weather and season suggestions, outfit calendar, worn log, streak, daily reminder |
| 7 | `add-smart-features` | AI stylist, closet statistics, trip packing lists, display mode |

## Working with the plan

```bash
openspec list
```

```bash
openspec status --change add-app-foundation
```

In Claude Code, `/opsx:apply add-app-foundation` starts implementing the first change.
