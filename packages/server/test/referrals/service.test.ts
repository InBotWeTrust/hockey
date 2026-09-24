import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findOrCreateTelegramUser } from '../../src/auth/users.js';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  claimReferralReward,
  reconcileReferralQualification,
} from '../../src/referrals/service.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../db/migrations',
);

describe.skipIf(!hasIntegrationEnv)('referral rewards', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(pool, migrationsDir);
  });

  beforeEach(async () => {
    await pool.query('truncate users restart identity cascade');
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createPair(): Promise<{ inviterId: string; inviteeId: string }> {
    const inviter = await findOrCreateTelegramUser(pool, {
      providerUid: 'referrer',
      displayName: 'Referrer',
    });
    const code = await pool.query<{ code: string }>(
      'select code from referral_code where user_id = $1',
      [inviter.id],
    );
    const invitee = await findOrCreateTelegramUser(pool, {
      providerUid: 'invitee',
      displayName: 'Invitee',
      referralCode: code.rows[0]!.code,
    });
    return { inviterId: inviter.id, inviteeId: invitee.id };
  }

  it('qualifies an invited amateur once and snapshots every reached milestone', async () => {
    const pair = await createPair();
    await pool.query('update users set lifetime_goals_total = 300 where id = $1', [pair.inviteeId]);

    expect(await reconcileReferralQualification(pool, pair.inviteeId)).toBe(true);
    expect(await reconcileReferralQualification(pool, pair.inviteeId)).toBe(false);

    const relationship = await pool.query(
      'select qualified_at from referral_relationship where invitee_user_id = $1',
      [pair.inviteeId],
    );
    expect(relationship.rows[0].qualified_at).toBeInstanceOf(Date);
    const unlocks = await pool.query(
      `select qualified_referrals_snapshot, reward_stars_snapshot
         from referral_reward_unlock
        where inviter_user_id = $1`,
      [pair.inviterId],
    );
    expect(unlocks.rows).toEqual([
      { qualified_referrals_snapshot: 1, reward_stars_snapshot: 25 },
    ]);
  });

  it('does not qualify a blocked invited player', async () => {
    const pair = await createPair();
    await pool.query(
      'update users set lifetime_goals_total = 300, blocked_at = now() where id = $1',
      [pair.inviteeId],
    );
    expect(await reconcileReferralQualification(pool, pair.inviteeId)).toBe(false);
  });

  it('claims a reward exactly once and records stars in the currency ledger', async () => {
    const pair = await createPair();
    await pool.query('update users set lifetime_goals_total = 300 where id = $1', [pair.inviteeId]);
    await reconcileReferralQualification(pool, pair.inviteeId);
    const unlock = await pool.query<{ id: string }>(
      'select id from referral_reward_unlock where inviter_user_id = $1',
      [pair.inviterId],
    );

    const first = await claimReferralReward(pool, pair.inviterId, unlock.rows[0]!.id);
    const second = await claimReferralReward(pool, pair.inviterId, unlock.rows[0]!.id);
    expect(first).toEqual({ stars: 25, awardedStars: 25, alreadyClaimed: false });
    expect(second).toEqual({ stars: 25, awardedStars: 0, alreadyClaimed: true });

    const ledger = await pool.query(
      `select reason, metadata->>'stars' as stars
         from currency_ledger
        where user_id = $1 and reason = 'referral_reward'`,
      [pair.inviterId],
    );
    expect(ledger.rows).toEqual([{ reason: 'referral_reward', stars: '25' }]);
  });
});
