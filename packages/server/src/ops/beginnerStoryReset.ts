import type { Pool } from 'pg';

export const RESET_KEY = '2026-10-03-beginner-story-production-reset-v1';
interface ResetReport { usersReset: number; applied: boolean; alreadyApplied: boolean }

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
    const published = await client.query(
      `select chain.key from onboarding_chain chain
       join onboarding_version version on version.id = chain.current_published_version_id
       where chain.key = 'beginner' and version.status = 'published' for update of chain`,
    );
    if (!published.rows[0]) throw new Error('A published beginner version is required before reset');
    await client.query('lock table users in share row exclusive mode');
    await client.query("update onboarding_chain set enforcement_enabled = true where key = 'beginner'");
    const updated = await client.query(
      `update users set beginner_onboarding_completed = false,
       beginner_onboarding_reset_at = transaction_timestamp()`,
    );
    const report = { usersReset: updated.rowCount ?? 0, applied: options.apply, alreadyApplied: false };
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
