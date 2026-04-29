import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyTelegramLoginPayload } from '../auth/telegram.js';
import { createJwt, verifyAccessToken, verifyRefreshToken } from '../auth/jwt.js';
import { exchangeVkCode, fetchVkProfile, type VkProfile } from '../auth/vk.js';
import { findOrCreateTelegramUser, findOrLinkOrCreateVkUser } from '../auth/users.js';
import { saveRefresh, consumeRefresh, revokeRefresh } from '../auth/session.js';
import { AppError } from '../plugins/errors.js';

export interface AuthRoutesOptions {
  telegramBotToken: string;
  vkAppId?: string;
  accessSecret: string;
  refreshSecret: string;
  devLoginEnabled?: boolean;
}

const tgBodySchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.union([z.string(), z.number()]),
    hash: z.string(),
    timezone: z.string().optional(),
  })
  .passthrough();

const vkBodySchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
  codeVerifier: z.string().min(1),
  deviceId: z.string().min(1),
  timezone: z.string().optional(),
});

function safeIanaTimezone(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > 64) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input });
    return input;
  } catch {
    return undefined;
  }
}

export async function tryReadAccessTokenFromHeader(
  header: string | undefined,
  accessSecret: string,
): Promise<string | undefined> {
  if (!header || !header.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return undefined;
  try {
    const payload = await verifyAccessToken(token, accessSecret);
    return payload.sub;
  } catch {
    return undefined;
  }
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const jwt = createJwt({
    accessSecret: opts.accessSecret,
    refreshSecret: opts.refreshSecret,
  });

  app.post('/auth/telegram', async (req, reply) => {
    const parsed = tgBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid telegram payload', 400);
    }
    const { timezone: rawTimezone, ...tgPayload } = parsed.data;
    let tgUser;
    try {
      tgUser = verifyTelegramLoginPayload(
        tgPayload as Record<string, unknown>,
        opts.telegramBotToken,
      );
    } catch (err) {
      req.log.warn({ err }, 'telegram auth failed');
      throw new AppError('unauthenticated', 'telegram hash invalid', 401);
    }

    const displayName =
      [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') || tgUser.username || 'player';
    const tz = safeIanaTimezone(rawTimezone);
    const user = await findOrCreateTelegramUser(app.pg, {
      providerUid: String(tgUser.id),
      displayName,
      ...(tgUser.photoUrl !== undefined ? { avatarUrl: tgUser.photoUrl } : {}),
      ...(tgUser.username !== undefined ? { username: tgUser.username } : {}),
      ...(tgUser.firstName ? { firstName: tgUser.firstName } : {}),
      ...(tgUser.lastName !== undefined ? { lastName: tgUser.lastName } : {}),
      ...(tz !== undefined ? { timezone: tz } : {}),
    });

    const [accessToken, refresh] = await Promise.all([
      jwt.issueAccessToken({ sub: user.id }),
      jwt.issueRefreshToken({ sub: user.id }),
    ]);
    await saveRefresh(app.redis, {
      jti: refresh.jti,
      userId: user.id,
      ttlSec: refresh.expSec,
    });

    reply.send({
      accessToken,
      refreshToken: refresh.token,
      user: { id: user.id, displayName: user.displayName },
    });
  });

  app.post('/auth/vk', async (req, reply) => {
    if (!opts.vkAppId) {
      throw new AppError('service_unavailable', 'VK auth is not configured', 503);
    }

    const parsed = vkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('bad_request', 'invalid vk auth payload', 400);
    }

    const currentUserId = await tryReadAccessTokenFromHeader(
      req.headers.authorization,
      opts.accessSecret,
    );

    let exchange;
    try {
      exchange = await exchangeVkCode({
        code: parsed.data.code,
        redirectUri: parsed.data.redirectUri,
        codeVerifier: parsed.data.codeVerifier,
        deviceId: parsed.data.deviceId,
        appId: opts.vkAppId,
      });
    } catch (err) {
      req.log.warn({ err }, 'vk auth exchange failed');
      throw new AppError('unauthenticated', 'vk auth failed', 401);
    }

    let profile: VkProfile = {};
    try {
      profile = await fetchVkProfile({
        accessToken: exchange.accessToken,
        appId: opts.vkAppId,
      });
    } catch (err) {
      req.log.warn({ err }, 'vk profile fetch failed');
    }

    const tz = safeIanaTimezone(parsed.data.timezone);
    const user = await findOrLinkOrCreateVkUser(app.pg, {
      vkUserId: exchange.vkUserId,
      profile,
      ...(currentUserId !== undefined ? { currentUserId } : {}),
      ...(tz !== undefined ? { timezone: tz } : {}),
    });

    const [accessToken, refresh] = await Promise.all([
      jwt.issueAccessToken({ sub: user.id }),
      jwt.issueRefreshToken({ sub: user.id }),
    ]);
    await saveRefresh(app.redis, {
      jti: refresh.jti,
      userId: user.id,
      ttlSec: refresh.expSec,
    });

    reply.send({
      accessToken,
      refreshToken: refresh.token,
      user: { id: user.id, displayName: user.displayName },
    });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
    if (!body.success) {
      throw new AppError('bad_request', 'refreshToken required', 400);
    }

    let payload;
    try {
      payload = await verifyRefreshToken(body.data.refreshToken, opts.refreshSecret);
    } catch {
      throw new AppError('unauthenticated', 'invalid refresh token', 401);
    }

    const consumed = await consumeRefresh(app.redis, payload.jti);
    if (!consumed || consumed.userId !== payload.sub) {
      throw new AppError('unauthenticated', 'refresh token not recognized', 401);
    }

    const [accessToken, refresh] = await Promise.all([
      jwt.issueAccessToken({ sub: payload.sub }),
      jwt.issueRefreshToken({ sub: payload.sub }),
    ]);
    await saveRefresh(app.redis, {
      jti: refresh.jti,
      userId: payload.sub,
      ttlSec: refresh.expSec,
    });

    reply.send({ accessToken, refreshToken: refresh.token });
  });

  if (opts.devLoginEnabled) {
    app.post('/auth/dev', async (req, reply) => {
      const body = z.object({ timezone: z.string().optional() }).safeParse(req.body ?? {});
      const tz = body.success ? safeIanaTimezone(body.data.timezone) : undefined;
      const user = await findOrCreateTelegramUser(app.pg, {
        providerUid: 'dev-user-1',
        displayName: 'Dev Player',
        ...(tz !== undefined ? { timezone: tz } : {}),
      });
      const [accessToken, refresh] = await Promise.all([
        jwt.issueAccessToken({ sub: user.id }),
        jwt.issueRefreshToken({ sub: user.id }),
      ]);
      await saveRefresh(app.redis, {
        jti: refresh.jti,
        userId: user.id,
        ttlSec: refresh.expSec,
      });
      reply.send({
        accessToken,
        refreshToken: refresh.token,
        user: { id: user.id, displayName: user.displayName },
      });
    });
  }

  app.post('/auth/logout', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body);
    if (body.success && body.data.refreshToken) {
      try {
        const payload = await verifyRefreshToken(body.data.refreshToken, opts.refreshSecret);
        await revokeRefresh(app.redis, payload.jti);
      } catch {
        // Не информируем о валидности чужого токена
      }
    }
    reply.status(204).send();
  });
};
