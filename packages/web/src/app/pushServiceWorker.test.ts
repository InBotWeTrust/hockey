import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA push notification artwork', () => {
  it('uses a dedicated transparent monochrome badge instead of the opaque app icon', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public/push-sw.js'), 'utf8');
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(worker).toContain("badge: payload.badge || '/icons/notification-badge.png'");
    expect(viteConfig).toContain("'icons/notification-badge.png'");
    expect(existsSync(resolve(process.cwd(), 'public/icons/notification-badge.png'))).toBe(true);
  });
});
