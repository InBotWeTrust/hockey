import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { parseSignedAndroidReleaseManifest, type SignedAndroidReleaseManifest } from './schema.js';
import { verifyReleaseManifest } from './signature.js';

export interface MobileReleaseRouteOptions {
  manifestPath: string;
  publicKeys: Record<string, string>;
  cacheMs?: number;
}

interface CachedRelease {
  manifest: SignedAndroidReleaseManifest;
  etag: string;
  mtimeMs: number;
}

export const mobileReleaseRoutes: FastifyPluginAsync<MobileReleaseRouteOptions> = async (
  app,
  options,
) => {
  let cached: CachedRelease | null = null;
  let checkedAt = 0;
  const cacheMs = options.cacheMs ?? 5_000;

  async function load(): Promise<CachedRelease | null> {
    const now = Date.now();
    if (now - checkedAt < cacheMs) return cached;
    checkedAt = now;
    try {
      const info = await stat(options.manifestPath);
      if (cached?.mtimeMs === info.mtimeMs) return cached;
      const bytes = await readFile(options.manifestPath);
      const manifest = parseSignedAndroidReleaseManifest(JSON.parse(bytes.toString('utf8')));
      const publicKey = options.publicKeys[manifest.keyId];
      if (publicKey === undefined || !verifyReleaseManifest(manifest, publicKey)) {
        cached = null;
        return null;
      }
      cached = {
        manifest,
        etag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
        mtimeMs: info.mtimeMs,
      };
      return cached;
    } catch {
      cached = null;
      return null;
    }
  }

  function unavailable(reply: FastifyReply) {
    return reply.status(503).send({ error: { code: 'mobile_release_unavailable' } });
  }

  app.addHook('onReady', async () => {
    await load();
  });

  app.get('/mobile/android/release', async (request, reply) => {
    const release = await load();
    if (release === null) return unavailable(reply);
    reply.header('Cache-Control', 'public, max-age=60, must-revalidate');
    reply.header('ETag', release.etag);
    if (request.headers['if-none-match'] === release.etag) return reply.status(304).send();
    return reply.send(release.manifest);
  });

  app.get('/mobile/android/download', async (_request, reply) => {
    const release = await load();
    if (release === null) return unavailable(reply);
    return reply.redirect(release.manifest.apkUrl, 302);
  });
};
