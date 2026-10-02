import type { Pool } from 'pg';
import { AppError } from '../plugins/errors.js';

/** Read-only preflight: production cannot create, resume or play a challenge via a direct URL. */
export async function assertBonusChallengeRouteAccess(
  pool: Pool, enabled: boolean, userId: string, params: { gameId?: string; attemptId?: string },
): Promise<void> {
  if (enabled || (!params.gameId && !params.attemptId)) return;
  const { rows } = params.gameId
    ? await pool.query<{ skill_code: string }>('select skill_code from bonus_game where id = $1', [params.gameId])
    : await pool.query<{ skill_code: string }>(
      'select game.skill_code from bonus_game_attempt attempt join bonus_game game on game.id = attempt.bonus_game_id where attempt.id = $1 and attempt.user_id = $2',
      [params.attemptId, userId]);
  if (rows[0]?.skill_code === 'challenge') throw new AppError('bonus_game_in_development', 'Раздел в разработке', 403);
}
