import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const nginxConfig = readFileSync(path.resolve(process.cwd(), 'nginx.conf'), 'utf8');
const viteConfig = readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');

describe('static artwork caching contract', () => {
  it('gives public images a durable browser cache outside the hashed assets directory', () => {
    expect(nginxConfig).toContain('location ~* ^/(?!assets/).+\\.(avif|gif|ico|jpe?g|png|svg|webp|woff2?)$');
    expect(nginxConfig).toContain('Cache-Control "public, max-age=2592000, stale-while-revalidate=86400"');
  });

  it('keeps the complete current image catalog in the service-worker cache', () => {
    expect(viteConfig).toContain('maxEntries: 500');
  });
});
