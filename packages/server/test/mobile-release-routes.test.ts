import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mobileReleaseRoutes } from '../src/mobileRelease/routes.js';
import { signReleaseManifest } from '../src/mobileRelease/signature.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

async function fixture(overrides: Record<string, unknown> = {}) {
  const keys = generateKeyPairSync('ed25519');
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const signed = signReleaseManifest(
    {
      versionName: '1.0.0',
      latestVersionCode: 1,
      minimumSupportedVersionCode: 1,
      apkUrl: 'https://ultimatehockey.ru/mobile/android/ultimate-hockey-1.apk',
      apkSizeBytes: 100,
      apkSha256: 'c'.repeat(64),
      releaseNotes: 'Первый релиз',
      publishedAt: '2026-09-13T12:00:00.000Z',
      keyId: 'release-key',
      ...overrides,
    },
    privateKey,
  );
  const directory = await mkdtemp(path.join(tmpdir(), 'hockey-release-test-'));
  const manifestPath = path.join(directory, 'release.json');
  await writeFile(manifestPath, JSON.stringify(signed));
  const app = Fastify();
  apps.push(app);
  await app.register(mobileReleaseRoutes, {
    manifestPath,
    publicKeys: { 'release-key': publicKey },
  });
  return { app, manifestPath, publicKey, signed };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('mobile Android release routes', () => {
  it('serves a verified manifest with cache validators', async () => {
    const { app, signed } = await fixture();
    const first = await app.inject({ method: 'GET', url: '/mobile/android/release' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual(signed);
    expect(first.headers['cache-control']).toBe('public, max-age=60, must-revalidate');
    const second = await app.inject({
      method: 'GET',
      url: '/mobile/android/release',
      headers: { 'if-none-match': first.headers.etag! },
    });
    expect(second.statusCode).toBe(304);
  });

  it('redirects downloads only through the verified manifest URL', async () => {
    const { app, signed } = await fixture();
    const response = await app.inject({ method: 'GET', url: '/mobile/android/download' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(signed.apkUrl);
  });

  it('serves a CSP-protected public download page from verified metadata', async () => {
    const { app, signed } = await fixture();
    const response = await app.inject({ method: 'GET', url: '/download/android' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toContain(signed.apkUrl);
  });

  it('returns 503 when the manifest is absent or invalid', async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(mobileReleaseRoutes, {
      manifestPath: path.join(tmpdir(), 'definitely-absent-release.json'),
      publicKeys: {},
    });
    const response = await app.inject({ method: 'GET', url: '/mobile/android/release' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: 'mobile_release_unavailable' } });
  });

  it('rejects a manifest whose signed fields were changed on disk', async () => {
    const { app, manifestPath, signed } = await fixture();
    await writeFile(manifestPath, JSON.stringify({ ...signed, apkSizeBytes: 101 }));
    const response = await app.inject({ method: 'GET', url: '/mobile/android/download' });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 for an unknown signing key', async () => {
    const { manifestPath } = await fixture();
    const isolated = Fastify();
    apps.push(isolated);
    await isolated.register(mobileReleaseRoutes, {
      manifestPath,
      publicKeys: { other: 'not-the-release-key' },
    });
    const response = await isolated.inject({ method: 'GET', url: '/mobile/android/release' });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 for a malformed signature', async () => {
    const { manifestPath, signed, publicKey } = await fixture();
    await writeFile(manifestPath, JSON.stringify({ ...signed, signature: 'not-a-signature' }));
    const isolated = Fastify();
    apps.push(isolated);
    await isolated.register(mobileReleaseRoutes, {
      manifestPath,
      publicKeys: { 'release-key': publicKey },
      cacheMs: 0,
    });
    const response = await isolated.inject({ method: 'GET', url: '/mobile/android/release' });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 when the minimum version exceeds the latest version', async () => {
    const { manifestPath, signed, publicKey } = await fixture();
    await writeFile(
      manifestPath,
      JSON.stringify({ ...signed, minimumSupportedVersionCode: signed.latestVersionCode + 1 }),
    );
    const isolated = Fastify();
    apps.push(isolated);
    await isolated.register(mobileReleaseRoutes, {
      manifestPath,
      publicKeys: { 'release-key': publicKey },
      cacheMs: 0,
    });
    const response = await isolated.inject({ method: 'GET', url: '/mobile/android/download' });
    expect(response.statusCode).toBe(503);
    expect(response.headers.location).toBeUndefined();
  });
});
