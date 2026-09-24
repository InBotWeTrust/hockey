import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../db/migrations/160_referrals.sql', import.meta.url);

describe('migration 160 referrals', () => {
  it('creates immutable referral identities, relationships, milestones and reward snapshots', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    expect(sql).toMatch(/create table referral_code/i);
    expect(sql).toMatch(/code text not null unique/i);
    expect(sql).toMatch(/create table referral_relationship/i);
    expect(sql).toMatch(/invitee_user_id uuid primary key/i);
    expect(sql).toMatch(/check \(inviter_user_id <> invitee_user_id\)/i);
    expect(sql).toMatch(/create table referral_milestone/i);
    expect(sql).toMatch(/qualified_referrals int not null unique/i);
    expect(sql).toMatch(/create table referral_reward_unlock/i);
    expect(sql).toMatch(/qualified_referrals_snapshot int not null/i);
    expect(sql).toMatch(/reward_stars_snapshot int not null/i);
    expect(sql).toMatch(/unique \(inviter_user_id, milestone_id\)/i);
  });

  it('seeds the approved reward ladder and permits referral rewards in the ledger', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    for (const [qualified, stars] of [
      [1, 25],
      [5, 100],
      [10, 150],
      [15, 200],
      [30, 500],
      [50, 800],
      [100, 2000],
    ]) {
      expect(sql).toContain(`(${qualified}, ${stars},`);
    }
    expect(sql).toContain("'monthly_duel_rating_reward'");
    expect(sql).toContain("'referral_reward'");
  });
});
