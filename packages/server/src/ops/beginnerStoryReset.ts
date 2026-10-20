import type { Pool } from 'pg';
import { onboardingStepInputSchema } from '../onboarding/types.js';

export const BEGINNER_STORY_TUTORIAL_STEP = {
  position: 1, kind: 'tutorial_shot', title: 'Один бросок',
  description: 'Дождись своего момента и бросай. Второй попытки не будет.',
  ctaLabel: 'Что дальше?',
  tutorial: { shooterFrequency: 0.8, goalieFrequency: 0.65, goalFrequency: 0.55 },
} as const;

export const RESET_KEY = '2026-10-03-beginner-story-production-reset-v1';
interface ResetReport { usersReset: number; applied: boolean; alreadyApplied: boolean; publishedVersionCreated?: boolean }

export async function resetBeginnerStory(pool: Pool, options: { apply: boolean }): Promise<ResetReport> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [RESET_KEY]);
    const previous = await client.query<{ payload: ResetReport }>(
      'select payload from production_data_operations where operation_key = $1', [RESET_KEY],
    );
    if (previous.rows[0]) {
      await client.query('rollback');
      return { ...previous.rows[0].payload, applied: false, alreadyApplied: true };
    }
    await client.query("insert into onboarding_chain (key) values ('beginner') on conflict (key) do nothing");
    await client.query("select key from onboarding_chain where key = 'beginner' for update");
    const published = await client.query(
      `select chain.key from onboarding_chain chain
       join onboarding_version version on version.id = chain.current_published_version_id
       where chain.key = 'beginner' and version.status = 'published' for update of chain`,
    );
    const publishedVersionCreated = !published.rows[0];
    if (publishedVersionCreated) {
      // Cinematic scenes live in the web client; the server contract needs one tutorial.
      // Creating a separate published version preserves every existing draft and history.
      const step = BEGINNER_STORY_TUTORIAL_STEP;
      onboardingStepInputSchema.parse(step);
      const version = await client.query<{ id: string }>(
        "insert into onboarding_version (chain_key, status, published_at) values ('beginner', 'published', transaction_timestamp()) returning id",
      );
      const versionId = version.rows[0]?.id;
      if (!versionId) throw new Error('Beginner story publication returned no version');
      await client.query(
        `insert into onboarding_step (version_id, position, kind, title, description, cta_label, tutorial_config)
         values ($1, $2, 'tutorial_shot', $3, $4, $5, $6::jsonb)`,
        [versionId, step.position, step.title, step.description, step.ctaLabel, step.tutorial],
      );
      await client.query(
        "update onboarding_chain set current_published_version_id = $1, updated_at = transaction_timestamp() where key = 'beginner'",
        [versionId],
      );
    }
    await client.query('lock table users in share row exclusive mode');
    await client.query("update onboarding_chain set enforcement_enabled = true where key = 'beginner'");
    const updated = await client.query(
      `update users set beginner_onboarding_completed = false,
       beginner_onboarding_reset_at = transaction_timestamp()`,
    );
    const report = { usersReset: updated.rowCount ?? 0, applied: options.apply, alreadyApplied: false,
      ...(publishedVersionCreated ? { publishedVersionCreated: true } : {}),
    };
    if (options.apply) {
      await client.query('insert into production_data_operations (operation_key, payload) values ($1, $2)', [RESET_KEY, report]);
    }
    await client.query(options.apply ? 'commit' : 'rollback');
    return report;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
