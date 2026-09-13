import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import capacitorConfig from '../capacitor.config.js';
import { ANDROID_MIN_SDK } from './config.js';

const mobileRoot = fileURLToPath(new URL('..', import.meta.url));

describe('Android application configuration', () => {
  it('keeps the permanent identity and Android 8 compatibility floor', () => {
    const gradleVariables = readFileSync(`${mobileRoot}/android/variables.gradle`, 'utf8');

    expect(capacitorConfig.appId).toBe('ru.ultimatehockey.app');
    expect(capacitorConfig.appName).toBe('Ультимейт Хоккей');
    expect(ANDROID_MIN_SDK).toBe(26);
    expect(gradleVariables).toContain('minSdkVersion = 26');
  });

  it('embeds the production web build instead of a remote application URL', () => {
    expect(capacitorConfig.webDir).toBe('../web/dist');
    expect(capacitorConfig.server?.url).toBeUndefined();
  });

  it('locks the Android activity to portrait orientation', () => {
    const manifest = readFileSync(
      `${mobileRoot}/android/app/src/main/AndroidManifest.xml`,
      'utf8',
    );

    expect(manifest).toContain('android:screenOrientation="portrait"');
  });
});
