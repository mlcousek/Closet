# Building and installing

Closet is developed on Windows and installed on an iPhone with AltStore. There is no Mac involved: GitHub Actions builds the app unsigned, and AltStore signs it with your Apple ID when it installs it.

## What you need

- Node.js 22 and this repository checked out.
- An iPhone on iOS 17 or later.
- [AltServer](https://altstore.io) on the PC and AltStore on the phone, both signed in with the same Apple ID.
- PC and phone on the same Wi-Fi network.

## Day-to-day checks

```bash
npm run check
```

This runs lint, type-check, the translation check and the unit tests, the same as CI does on every push.

## Getting a build

The repository is public, so builds on macOS runners are free. Every push that changes code builds `Closet.ipa`; changes to documentation alone do not. The file is under **Artifacts** on the run's page on GitHub and is kept for 14 days. A version tag or a manual run can also build the development client.

Start a build by hand for the current branch:

```bash
gh workflow run build-ios.yml -f variant=both
```

Follow it and download the result:

```bash
gh run watch
```

```bash
gh run download --dir build
```

With `variant=both` you get two files:

| File             | App name on the phone | Use                                                                       |
| ---------------- | --------------------- | ------------------------------------------------------------------------- |
| `Closet.ipa`     | Closet                | The real app, with the code bundled in.                                   |
| `Closet-Dev.ipa` | Closet Dev            | Development client. Loads code from your PC so changes appear in seconds. |

They have different bundle identifiers, so both can be installed at once and they do not share data.

## Installing with AltStore

1. Copy the `.ipa` to the phone (AirDrop is not available from Windows; iCloud Drive, a cable with the Files app, or any cloud storage works).
2. Open AltStore on the phone, go to **My Apps**, tap **+** and choose the `.ipa`.
3. AltStore signs and installs it.

With a free Apple ID:

- Each app expires 7 days after signing. AltStore refreshes apps in the background when the phone can reach AltServer on the same network; open AltStore and tap **Refresh All** if an app is close to expiring.
- At most 3 sideloaded apps at a time. Closet and Closet Dev use two of them.
- Push notifications, iCloud and app extensions are not available. The app only uses local notifications.

If an app does expire, reinstalling the same `.ipa` over it keeps its data. Removing the app deletes its data, so export a backup first (**Profile → Settings → Export backup**).

## Developing with the development client

1. Install `Closet-Dev.ipa` once. Reinstall it only when native dependencies change (a new Expo module, a new permission).
2. On the PC, start the development server:

   ```bash
   npx expo start --dev-client
   ```

3. Open **Closet Dev** on the phone. It lists the server if both devices are on the same network; otherwise enter the URL shown in the terminal. Windows Firewall must allow Node.js on private networks (port 8081).
4. Edit code. The app reloads on save.

## Releasing a version

1. Tag the commit and push the tag:

   ```bash
   git tag v0.1.0
   ```

   ```bash
   git push origin v0.1.0
   ```

2. The workflow builds both variants with that version number, creates a GitHub Release, and attaches `Closet.ipa`, `Closet-Dev.ipa` and `altstore-source.json`.

### Updating from inside AltStore

`altstore-source.json` is an AltStore source: add its URL once under **Sources** in AltStore and new releases show up as updates.

```
https://github.com/mlcousek/Closet/releases/latest/download/altstore-source.json
```

This only works while the repository is public, because AltStore cannot sign in to GitHub. While the repository is private, download `Closet.ipa` from the release and install it over the existing app as described above.

## Troubleshooting a failed build

- **Xcode or CocoaPods errors after upgrading Expo:** the workflow uses the newest stable Xcode on the runner. If a new Xcode breaks the build, pin a version in `.github/workflows/build-ios.yml` (`xcode-version`).
- **"No such module" for a new native dependency:** make sure it was added with `npx expo install`, so the version matches the Expo SDK.
- **The app opens and closes immediately on the phone:** it has expired or was signed for another Apple ID. Refresh or reinstall through AltStore.
