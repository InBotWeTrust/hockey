import type { Pool } from 'pg';
/** Existing isolated game tests do not seed the achievement catalogue. */
export async function installInactiveBarAchievementSchema(pool: Pool) {
  await pool.query(`create table if not exists bar_achievement_launch(singleton boolean,started_at timestamptz);
    create table if not exists bar_maria_matches(id uuid,user_id uuid,state jsonb,deadline_at timestamptz,ended_at timestamptz,started_at timestamptz);`);
}
