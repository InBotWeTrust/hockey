import type { Pool, PoolClient } from 'pg';
import type { ProfileAchievementDTO } from './service.js';
import { BAR_DEFINITIONS, BAR_CUMULATIVE_NUMBERS } from './barCatalog.js';
import { AppError } from '../plugins/errors.js';
const definitions = new Map(BAR_DEFINITIONS.map((d) => [d.id, d]));
export function decorateBarAchievement(
  card: ProfileAchievementDTO,
  amateur: boolean,
): ProfileAchievementDTO {
  const d = definitions.get(card.id);
  if (!d) return card;
  if (d.amateurOnly && !amateur)
    return {
      id: `bar-locked-${BAR_DEFINITIONS.indexOf(d)}`,
      photoUrl: '/profile/achievements-card-art.png',
      title: 'Неизвестное задание',
      description: 'Доступно со статуса «Любитель»',
      requirement: 'Доступно со статуса «Любитель»',
      category: 'bar',
      availability: 'active',
      futureTag: null,
      rewardCurrency: 0,
      rewardStars: 0,
      rewardExperience: 0,
      rewardTokens: 0,
      status: 'locked',
      isUnlocked: false,
      isClaimable: false,
      accessRequirement: 'amateur',
    };
  return {
    ...card,
    isUnlocked: true,
    bar: {
      mode: d.mode as 'character' | 'online' | 'social',
      game: d.game,
      gameLabel: d.gameLabel,
      character: d.character,
    },
    ...(card.stage && !BAR_CUMULATIVE_NUMBERS.has(d.number)
      ? {
          stage: { ...card.stage, progressValue: card.status === 'locked' ? 0 : 1, targetValue: 1 },
        }
      : {}),
  };
}
export async function hasBarAmateurAccess(db: Pool | PoolClient, user: string): Promise<boolean> {
  const r = await db.query<{ amateur: boolean }>(
    'select (amateur_onboarding_completed or amateur_access_preserved) as amateur from users where id=$1',
    [user],
  );
  return r.rows[0]?.amateur === true;
}
export async function assertBarAchievementAccess(db: Pool | PoolClient, user: string, id: string) {
  if (definitions.get(id)?.amateurOnly && !(await hasBarAmateurAccess(db, user)))
    throw new AppError('bar_character_unavailable', 'Доступно со статуса «Любитель»', 403);
}
