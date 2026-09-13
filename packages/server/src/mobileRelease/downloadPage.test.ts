import { describe, expect, it } from 'vitest';
import { renderAndroidDownloadPage } from './downloadPage.js';

describe('renderAndroidDownloadPage', () => {
  it('escapes release data and links only the verified APK URL', () => {
    const html = renderAndroidDownloadPage({
      versionName: '1.0 <script>alert(1)</script>',
      apkUrl: 'https://ultimatehockey.ru/mobile/android/ultimate-hockey-1.apk',
      apkSizeBytes: 10485760,
      releaseNotes: '<img src=x onerror=alert(1)>',
    });
    expect(html).toContain('1.0 &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('href="https://ultimatehockey.ru/mobile/android/ultimate-hockey-1.apk"');
    expect(html).toContain('Android 8.0');
    expect(html).toContain('10,0 МБ');
  });
});
