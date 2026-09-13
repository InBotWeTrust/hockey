import type { CapacitorConfig } from '@capacitor/cli';
import { ANDROID_APP_ID, ANDROID_APP_NAME, WEB_ASSET_DIRECTORY } from './src/config';

const config: CapacitorConfig = {
  appId: ANDROID_APP_ID,
  appName: ANDROID_APP_NAME,
  webDir: WEB_ASSET_DIRECTORY,
  server: {
    androidScheme: 'https',
    cleartext: false,
    hostname: 'localhost',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
