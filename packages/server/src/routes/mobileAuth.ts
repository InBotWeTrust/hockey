import type { FastifyPluginAsync } from 'fastify';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createJwt } from '../auth/jwt.js';
import {
  assertMobileAuthAttempt,
  completeMobileAuthAttempt,
  consumeMobileAuthHandoff,
  createMobileAuthAttempt,
} from '../auth/mobileHandoff.js';
import { saveRefresh } from '../auth/session.js';
import { verifyTelegramLoginPayload } from '../auth/telegram.js';
import { findOrCreateTelegramUser, findOrLinkOrCreateVkUser } from '../auth/users.js';
import { exchangeVkCode, fetchVkProfile } from '../auth/vk.js';
import { AppError } from '../plugins/errors.js';

export interface MobileAuthRoutesOptions {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSec?: number;
  telegramBotToken: string;
  vkAppId?: string;
  accountRecoveryTelegramProviderUids?: readonly string[];
}

interface AuthUserRow {
  id: string;
  display_name: string;
  role: 'player' | 'admin';
  grip: 'left' | 'right';
  avatar_url: string | null;
  display_source: 'telegram' | 'vk' | 'custom';
  blocked_at: Date | null;
}

const attemptSchema = z.object({
  provider: z.enum(['telegram', 'vk']),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  referralCode: z.string().trim().min(1).max(32).optional(),
  referralSource: z.enum(['manual', 'link']).optional(),
  installationId: z.string().min(8).max(128).optional(),
});

const exchangeSchema = z.object({
  handoffCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  codeVerifier: z.string().min(43).max(128),
});

const telegramCompleteSchema = z
  .object({
    attemptId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    id: z.union([z.string(), z.number()]),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.union([z.string(), z.number()]),
    hash: z.string(),
  })
  .passthrough();

const VK_CALLBACK_URI = 'https://ultimatehockey.ru/api/mobile/auth/vk/callback';
const COMPLETE_URL = 'https://ultimatehockey.ru/mobile/auth/complete';

function referralErrorUrl(error: unknown): string | null {
  if (!(error instanceof AppError) || error.code !== 'referral_code_invalid') return null;
  return `${COMPLETE_URL}?error=referral_code_invalid`;
}

function opaqueCode(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export const mobileAuthRoutes: FastifyPluginAsync<MobileAuthRoutesOptions> = async (app, opts) => {
  const jwt = createJwt({
    accessSecret: opts.accessSecret,
    refreshSecret: opts.refreshSecret,
    ...(opts.accessTtlSec === undefined ? {} : { accessTtlSec: opts.accessTtlSec }),
  });

  app.post('/mobile/auth/attempt', async (req, reply) => {
    const body = attemptSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid mobile auth attempt', 400);
    const hash = (value: string): string => createHmac('sha256', opts.accessSecret).update(value).digest('hex');
    const attempt = await createMobileAuthAttempt(app.redis, {
      provider: body.data.provider,
      codeChallenge: body.data.codeChallenge,
      ...(body.data.referralCode ? { referralCode: body.data.referralCode, referralSource: body.data.referralSource ?? 'manual', referralIpHash: hash(`ip:${req.ip}`) } : {}),
      ...(body.data.referralCode && body.data.installationId ? { referralInstallationHash: hash(`installation:${body.data.installationId}`) } : {}),
    });
    reply.status(201).send(attempt);
  });

  app.post('/mobile/auth/exchange', async (req, reply) => {
    const body = exchangeSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid mobile auth exchange', 400);
    const userId = await consumeMobileAuthHandoff(app.redis, body.data);
    const { rows } = await app.pg.query<AuthUserRow>(
      `select id, display_name, role, grip, avatar_url, display_source, blocked_at
         from users
        where id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) throw new AppError('unauthenticated', 'user not found', 401);
    if (user.blocked_at !== null) throw new AppError('forbidden', 'user is blocked', 403);

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
      user: {
        id: user.id,
        displayName: user.display_name,
        role: user.role,
        grip: user.grip,
        ...(user.avatar_url === null ? {} : { avatarUrl: user.avatar_url }),
        displaySource: user.display_source,
      },
    });
  });

  app.get('/mobile/auth/vk/start', async (req, reply) => {
    if (!opts.vkAppId) {
      throw new AppError('service_unavailable', 'VK auth is not configured', 503);
    }
    const query = z
      .object({ attempt: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .safeParse(req.query);
    if (!query.success) throw new AppError('bad_request', 'invalid mobile auth attempt', 400);
    await assertMobileAuthAttempt(app.redis, query.data.attempt, 'vk');

    const state = opaqueCode();
    const codeVerifier = opaqueCode(64);
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    await app.redis.setex(
      `mobile-auth:vk-state:${state}`,
      300,
      JSON.stringify({ attemptId: query.data.attempt, codeVerifier }),
    );
    const authorizeUrl = new URL('https://id.vk.com/authorize');
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: opts.vkAppId,
      redirect_uri: VK_CALLBACK_URI,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 's256',
      scope: '',
    }).toString();
    reply.redirect(authorizeUrl.toString());
  });

  app.get('/mobile/auth/vk/callback', async (req, reply) => {
    if (!opts.vkAppId) {
      throw new AppError('service_unavailable', 'VK auth is not configured', 503);
    }
    const query = z
      .object({
        code: z.string().min(1),
        state: z.string().min(1),
        device_id: z.string().min(1),
      })
      .safeParse(req.query);
    if (!query.success) throw new AppError('bad_request', 'invalid VK callback', 400);

    const rawState = await app.redis.getdel(`mobile-auth:vk-state:${query.data.state}`);
    if (!rawState) throw new AppError('mobile_auth_state_invalid', 'VK state expired', 401);
    const state = JSON.parse(rawState) as { attemptId: string; codeVerifier: string };
    await assertMobileAuthAttempt(app.redis, state.attemptId, 'vk');

    const exchange = await exchangeVkCode({
      code: query.data.code,
      redirectUri: VK_CALLBACK_URI,
      codeVerifier: state.codeVerifier,
      deviceId: query.data.device_id,
      appId: opts.vkAppId,
    });
    const profile = await fetchVkProfile({
      accessToken: exchange.accessToken,
      appId: opts.vkAppId,
    });
    const attempt = await assertMobileAuthAttempt(app.redis, state.attemptId, 'vk');
    let user;
    try {
      user = await findOrLinkOrCreateVkUser(app.pg, {
        vkUserId: exchange.vkUserId,
        profile,
        ...attempt,
        ...(opts.accountRecoveryTelegramProviderUids === undefined
          ? {}
          : { recoveryMergeTelegramProviderUids: opts.accountRecoveryTelegramProviderUids }),
      });
    } catch (error) {
      const redirectUrl = referralErrorUrl(error);
      if (redirectUrl) return reply.redirect(redirectUrl);
      throw error;
    }
    const { handoffCode } = await completeMobileAuthAttempt(app.redis, {
      attemptId: state.attemptId,
      userId: user.id,
      provider: 'vk',
    });
    reply.redirect(`${COMPLETE_URL}?code=${encodeURIComponent(handoffCode)}`);
  });

  app.post('/mobile/auth/telegram/complete', async (req, reply) => {
    const body = telegramCompleteSchema.safeParse(req.body);
    if (!body.success) throw new AppError('bad_request', 'invalid Telegram payload', 400);
    const { attemptId, ...telegramPayload } = body.data;
    let telegramUser;
    try {
      telegramUser = verifyTelegramLoginPayload(
        telegramPayload as Record<string, unknown>,
        opts.telegramBotToken,
      );
    } catch {
      throw new AppError('unauthenticated', 'telegram hash invalid', 401);
    }
    const attempt = await assertMobileAuthAttempt(app.redis, attemptId, 'telegram');
    const displayName =
      [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(' ') ||
      telegramUser.username ||
      'player';
    let user;
    try {
      user = await findOrCreateTelegramUser(app.pg, {
        providerUid: String(telegramUser.id),
        displayName,
        ...(telegramUser.photoUrl === undefined ? {} : { avatarUrl: telegramUser.photoUrl }),
        ...(telegramUser.username === undefined ? {} : { username: telegramUser.username }),
        ...(telegramUser.firstName ? { firstName: telegramUser.firstName } : {}),
        ...(telegramUser.lastName === undefined ? {} : { lastName: telegramUser.lastName }),
        ...attempt,
        ...(opts.accountRecoveryTelegramProviderUids === undefined
          ? {}
          : { recoveryMergeTelegramProviderUids: opts.accountRecoveryTelegramProviderUids }),
      });
    } catch (error) {
      const redirectUrl = referralErrorUrl(error);
      if (redirectUrl) return reply.send({ redirectUrl });
      throw error;
    }
    const { handoffCode } = await completeMobileAuthAttempt(app.redis, {
      attemptId,
      userId: user.id,
      provider: 'telegram',
    });
    reply.send({ redirectUrl: `${COMPLETE_URL}?code=${encodeURIComponent(handoffCode)}` });
  });
};
