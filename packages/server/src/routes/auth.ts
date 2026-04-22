import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { verifyTelegramLoginPayload } from '../auth/telegram.js';
import { createJwt, verifyRefreshToken } from '../auth/jwt.js';
import { findOrCreateTelegramUser } from '../auth/users.js';
import { saveRefresh, consumeRefresh, revokeRefresh } from '../auth/session.js';
import { AppError } from '../plugins/errors.js';

export interface AuthRoutesOptions {
  telegramBotToken: string;
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
  })
  .passthrough();

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
    let tgUser;
    try {
      tgUser = verifyTelegramLoginPayload(
        parsed.data as Record<string, unknown>,
        opts.telegramBotToken,
      );
    } catch (err) {
      req.log.warn({ err }, 'telegram auth failed');
      throw new AppError('unauthenticated', 'telegram hash invalid', 401);
    }

    const displayName =
      [tgUser.firstName, tgUser.lastName].filter(Boolean).join(' ') ||
      tgUser.username ||
      'player';
    const user = await findOrCreateTelegramUser(app.pg, {
      providerUid: String(tgUser.id),
      displayName,
      ...(tgUser.photoUrl !== undefined ? { avatarUrl: tgUser.photoUrl } : {}),
      ...(tgUser.username !== undefined ? { username: tgUser.username } : {}),
      ...(tgUser.firstName ? { firstName: tgUser.firstName } : {}),
      ...(tgUser.lastName !== undefined ? { lastName: tgUser.lastName } : {}),
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
    app.post('/auth/dev', async (_req, reply) => {
      const user = await findOrCreateTelegramUser(app.pg, {
        providerUid: 'dev-user-1',
        displayName: 'Dev Player',
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
