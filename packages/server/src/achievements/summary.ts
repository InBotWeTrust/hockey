import type { Pool, PoolClient } from 'pg';

export interface AchievementSummary {
  completed: number;
  total: number;
  levels: { completed: number; total: number };
}

/** Reads precomputed counters only; must never repair progression on a profile GET. */
export async function readAchievementSummary(db: Pool | PoolClient, userId: string): Promise<AchievementSummary> {
  const { rows } = await db.query<{
    completed_tasks: number; completed_levels: number; total_tasks: number; total_levels: number;
  }>(`select coalesce(progress.completed_tasks, 0)::int as completed_tasks,
             coalesce(progress.completed_levels, 0)::int as completed_levels,
             catalogue.total_tasks, catalogue.total_levels
        from achievement_catalog_summary catalogue
        left join user_achievement_summary progress on progress.user_id = $1
       where catalogue.singleton`, [userId]);
  const row = rows[0];
  if (!row) throw new Error('Achievement catalogue summary is not initialized');
  return { completed: row.completed_tasks, total: row.total_tasks,
    levels: { completed: row.completed_levels, total: row.total_levels } };
}
