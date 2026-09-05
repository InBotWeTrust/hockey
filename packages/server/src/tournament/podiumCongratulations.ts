import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export interface RegularSeasonPodiumRewardSnapshot {
  coins: number;
  stars: number;
  experience: number;
}

export interface RegularSeasonPodiumCongratulationDTO {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  place: 1 | 2 | 3;
  reward: RegularSeasonPodiumRewardSnapshot;
  createdAt: string;
}

interface CongratulationRow {
  id: string;
  tournament_id: string;
  tournament_title: string;
  place: number;
  reward_coins: number | string;
  reward_stars: number | string;
  reward_experience: number | string;
  created_at: Date | string;
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDto(row: CongratulationRow): RegularSeasonPodiumCongratulationDTO {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    place: row.place as 1 | 2 | 3,
    reward: {
      coins: Number(row.reward_coins),
      stars: Number(row.reward_stars),
      experience: Number(row.reward_experience),
    },
    createdAt: isoTimestamp(row.created_at),
  };
}

export async function createRegularSeasonPodiumCongratulations(
  client: PoolClient,
  tournamentId: string,
): Promise<void> {
  await client.query(
    `insert into tournament_regular_podium_congratulation
       (tournament_id, user_id, place, tournament_title,
        reward_coins, reward_stars, reward_experience)
     select t.id,
            p.user_id,
            s.rank,
            t.title,
            coalesce(e.coins, 0),
            coalesce(e.stars, 0),
            coalesce(e.experience, 0)
       from tournament t
       join tournament_standing s on s.tournament_id = t.id
       join tournament_participant p on p.id = s.participant_id
       left join tournament_economy_event e
         on e.idempotency_key = concat(
              'tournament:', t.id, ':reward:regular:', s.rank, ':', p.user_id
            )
        and e.status = 'applied'
      where t.id = $1
        and s.rank between 1 and 3
     on conflict (tournament_id, user_id) do nothing`,
    [tournamentId],
  );
}

export async function listPendingRegularSeasonPodiumCongratulations(
  pool: Pool,
  userId: string,
): Promise<RegularSeasonPodiumCongratulationDTO[]> {
  const result = await pool.query<CongratulationRow>(
    `select id, tournament_id, tournament_title, place,
            reward_coins, reward_stars, reward_experience, created_at
       from tournament_regular_podium_congratulation
      where user_id = $1 and viewed_at is null
      order by created_at, id`,
    [userId],
  );
  return result.rows.map(toDto);
}

export async function acknowledgeRegularSeasonPodiumCongratulation(
  pool: Pool,
  input: { congratulationId: string; userId: string },
): Promise<{ acknowledged: true }> {
  const result = await pool.query(
    `update tournament_regular_podium_congratulation
        set viewed_at = coalesce(viewed_at, now())
      where id = $1 and user_id = $2
      returning id`,
    [input.congratulationId, input.userId],
  );
  if (result.rowCount === 0) {
    throw new AppError('not_found', 'podium congratulation not found', 404);
  }
  return { acknowledged: true };
}
