import type { ExpoConfig } from 'expo/config';

// Two variants so the development client and the release build can be installed side by side.
const IS_DEV = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  name: IS_DEV ? 'Closet Dev' : 'Closet',
  slug: 'closet',
  version: '0.1.0',
  orientation: 'portrait',
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
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
