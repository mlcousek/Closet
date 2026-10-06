import type { ExpoConfig } from 'expo/config';
import { withEntitlementsPlist } from 'expo/config-plugins';

// Two variants so the development client and the release build can be installed side by side.
const IS_DEV = process.env.APP_VARIANT === 'development';

/**
 * The notifications module adds the push entitlement by itself. The app only
 * schedules local reminders, and a build re-signed with a free Apple ID cannot
 * be provisioned for push, so the entitlement is taken out again.
 */
const withoutPushEntitlement = (expo: ExpoConfig): ExpoConfig =>
  withEntitlementsPlist(expo, (entitlements) => {
    delete entitlements.modResults['aps-environment'];
    return entitlements;
  });

const config: ExpoConfig = {
  name: IS_DEV ? 'Closet Dev' : 'Closet',
  slug: 'closet',
  version: process.env.APP_VERSION ?? '0.1.0',
  // Every screen but the wall display locks itself to portrait in the root layout.
  orientation: 'default',
  icon: IS_DEV ? './assets/images/icon-dev.png' : './assets/images/icon.png',
  scheme: IS_DEV ? 'closet-dev' : 'closet',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: IS_DEV ? 'cz.mlcousek.closet.dev' : 'cz.mlcousek.closet',
    buildNumber: process.env.BUILD_NUMBER ?? '1',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleLocalizations: ['en', 'cs'],
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F4EEFB',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-sqlite',
    'expo-secure-store',
    'expo-localization',
    'expo-sharing',
    'expo-document-picker',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Closet uses your approximate location to show the weather and suggest outfits for it.',
      },
    ],
    [
      'expo-media-library',
      {
        savePhotosPermission: 'Closet saves outfit images you export to your photo library.',
        photosPermission: 'Closet uses your photo library to add photos of you and your clothes.',
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Closet uses the camera to photograph you and your clothes.',
        photosPermission: 'Closet uses your photo library to add photos of you and your clothes.',
        microphonePermission: false,
      },
    ],
  ],
  locales: {
    en: './locales/en.json',
    cs: './locales/cs.json',
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default withoutPushEntitlement(config);
