import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  claimReferralReward,
  getReferralSummary,
  listReferralInvitees,
  normalizeReferralCode,
} from './service.js';

export const referralRoutes: FastifyPluginAsync = async (app) => {
  app.get('/referrals/code/:code', async (req) => {
    const params = z.object({ code: z.string().min(1).max(32) }).parse(req.params);
    const code = normalizeReferralCode(params.code);
    const result = await app.pg.query('select 1 from referral_code where code = $1', [code]);
    return { valid: result.rowCount === 1 };
  });

  app.get('/referrals/me', { preHandler: [app.authenticate] }, async (req) => {
    return getReferralSummary(app.pg, req.user.id);
  });

  app.get('/referrals/invitees', { preHandler: [app.authenticate] }, async (req) => {
    const query = z
      .object({
        level: z.enum(['beginner', 'amateur', 'professional']),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return listReferralInvitees(app.pg, {
      inviterUserId: req.user.id,
      level: query.level,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.post('/referrals/rewards/:unlockId/claim', { preHandler: [app.authenticate] }, async (req) => {
    const params = z.object({ unlockId: z.string().uuid() }).parse(req.params);
    return claimReferralReward(app.pg, req.user.id, params.unlockId);
  });
};
