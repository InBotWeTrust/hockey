import type { Pool, PoolClient } from 'pg';
import { getGameSettings } from '../duel/gameSettings.js';
import { AppError } from '../plugins/errors.js';
import { resolveCompetitionLevel, type CompetitionLevel } from './summary.js';

type Queryable = Pool | PoolClient;

export interface AmateurAccessSnapshot {
  competitionLevel: CompetitionLevel;
  unlockGoalsRequired: number;
  qualifyingGoals: number;
  goalsRemaining: number;
  hasFullAccess: boolean;
}

export async function resolveAmateurAccess(
  db: Queryable,
  userId: string,
): Promise<AmateurAccessSnapshot> {
  const { rows } = await db.query<{
    level: number | string;
    lifetime_goals_total: number | string;
  }>(`select level, lifetime_goals_total from users where id = $1`, [userId]);
  const user = rows[0];
  if (!user) throw new AppError('not_found', 'user not found', 404);

  const settings = await getGameSettings(db);
  const level = Number(user.level);
  const qualifyingGoals = Number(user.lifetime_goals_total);
  const unlockGoalsRequired = settings.amateur.unlockGoalsRequired;
  const competitionLevel = resolveCompetitionLevel(level, qualifyingGoals, unlockGoalsRequired);

  return {
    competitionLevel,
    unlockGoalsRequired,
    qualifyingGoals,
    goalsRemaining: Math.max(0, unlockGoalsRequired - qualifyingGoals),
    hasFullAccess: competitionLevel !== 'beginner',
  };
}

export async function assertFullAmateurAccess(
  db: Queryable,
  userId: string,
): Promise<AmateurAccessSnapshot> {
  const access = await resolveAmateurAccess(db, userId);
  if (!access.hasFullAccess) {
    throw new AppError('amateur_level_required', 'amateur league is locked', 403, {
      goalsRemaining: access.goalsRemaining,
      unlockGoalsRequired: access.unlockGoalsRequired,
    });
  }
  return access;
}
