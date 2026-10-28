import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { applyMigrations } from '../../src/db/migrations.js';
import {
  ACHIEVEMENT_STAGE_DEFINITIONS,
  TIERED_ACHIEVEMENT_IDS,
} from '../../src/achievements/stageCatalog.js';
import { observeAchievementStage } from '../../src/achievements/stageProgress.js';
import { claimCurrentAchievementStage } from '../../src/achievements/claimStage.js';
import { createTestPool, hasIntegrationEnv, resetDatabase } from '../helpers/testDb.js';

describe.skipIf(!hasIntegrationEnv)('every enabled achievement ladder', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = createTestPool();
    await resetDatabase(pool);
    await applyMigrations(
      pool,
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations'),
    );
  });
  afterAll(async () => {
    await pool?.end();
  });

  it.each([...TIERED_ACHIEVEMENT_IDS])(
    '%s enforces every threshold and pays each level exactly once',
    async (achievementId) => {
      const userId = randomUUID();
      await pool.query(
        "insert into users(id,display_name,timezone) values($1,'Ladder test','UTC')",
        [userId],
      );
      const stages = ACHIEVEMENT_STAGE_DEFINITIONS.filter(
        (stage) => stage.achievementId === achievementId,
      );
      let stars = 0;
      let experience = 0;
      let coins = 0;
      for (const stage of stages) {
        const below = { ...stage.target };
        const field = Object.keys(below).find((key) => typeof below[key] === 'number')!;
        below[field] = Number(below[field]) + (field.startsWith('maximum') ? 1 : -1);
        await expect(
          observeAchievementStage(pool, userId, achievementId, {
            eventKey: `below:${stage.stageNumber}`,
            occurredAt: new Date(),
            progress: below,
          }),
        ).resolves.toMatchObject({ completed: false, stageNumber: stage.stageNumber });
        await expect(
          observeAchievementStage(pool, userId, achievementId, {
            eventKey: `exact:${stage.stageNumber}`,
            occurredAt: new Date(),
            progress: stage.target,
          }),
        ).resolves.toMatchObject({ completed: true, stageNumber: stage.stageNumber });
        const client = await pool.connect();
        try {
          await client.query('begin');
          const claimed = await claimCurrentAchievementStage(
            client,
            userId,
            achievementId,
            new Date(),
          );
          expect(claimed.stage.claimed).toBe(stage.stageNumber);
          stars += stage.rewardStars;
          experience += stage.rewardExperience;
          coins += stage.rewardCurrency;
          expect(claimed.balances).toMatchObject({
            starBalance: stars,
            experienceBalance: experience,
            currencyBalance: coins,
          });
          await client.query('commit');
          await client.query('begin');
          await expect(
            claimCurrentAchievementStage(client, userId, achievementId, new Date()),
          ).rejects.toMatchObject({ code: expect.stringMatching(/^(conflict|not_found)$/) });
          await client.query('rollback');
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally {
          client.release();
        }
      }
      expect(
        (
          await pool.query(
            "select count(*)::int as n from currency_ledger where user_id=$1 and reason='achievement_reward'",
            [userId],
          )
        ).rows[0].n,
      ).toBe(stages.length);
    },
  );
});
