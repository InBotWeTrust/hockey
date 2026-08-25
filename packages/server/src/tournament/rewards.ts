import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { enqueueTournamentAudiencePush } from '../push/tournament.js';

interface CompletedSeries {
  higherId: string;
  lowerId: string;
  winnerId: string;
}

export function resolvePlayoffPlacements(input: {
  final: CompletedSeries;
  bronze?: CompletedSeries;
}): Array<{ place: number; participantId: string }> {
  const finalLoser =
    input.final.higherId === input.final.winnerId ? input.final.lowerId : input.final.higherId;
  const placements = [
    { place: 1, participantId: input.final.winnerId },
    { place: 2, participantId: finalLoser },
  ];
  if (input.bronze) {
    const bronzeLoser =
      input.bronze.higherId === input.bronze.winnerId
        ? input.bronze.lowerId
        : input.bronze.higherId;
    placements.push(
      { place: 3, participantId: input.bronze.winnerId },
      { place: 4, participantId: bronzeLoser },
    );
  }
  return placements;
}

interface StageReward {
  place: number;
  coins: number;
  stars: number;
  experience: number;
}

function parseRewards(value: unknown): StageReward[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.place !== 'number' || !Number.isInteger(row.place) || row.place < 1) return [];
    const amount = (key: string) =>
      typeof row[key] === 'number' && Number.isInteger(row[key]) && row[key] >= 0 ? row[key] : 0;
    return [
      {
        place: row.place,
        coins: amount('coins'),
        stars: amount('stars'),
        experience: amount('experience'),
      },
    ];
  });
}

async function grantOne(
  client: PoolClient,
  input: {
    tournamentId: string;
    participantId: string;
    userId: string;
    stage: 'regular' | 'playoff';
    place: number;
    reward: StageReward;
  },
): Promise<boolean> {
  const key = `tournament:${input.tournamentId}:reward:${input.stage}:${input.place}:${input.userId}`;
  const event = await client.query<{ id: string }>(
    `insert into tournament_economy_event
       (tournament_id, participant_id, idempotency_key, kind, coins, stars, experience, metadata)
     values ($1, $2, $3, 'stage_reward', $4, $5, $6, $7)
     on conflict (idempotency_key) do nothing returning id`,
    [
      input.tournamentId,
      input.participantId,
      key,
      input.reward.coins,
      input.reward.stars,
      input.reward.experience,
      JSON.stringify({ stage: input.stage, place: input.place }),
    ],
  );
  if (event.rowCount === 0) return false;
  await client.query('select id from users where id = $1 for update', [input.userId]);
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [input.userId],
  );
  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account set balance = balance + $2, updated_at = now()
      where user_id = $1 returning balance, reserved_balance`,
    [input.userId, input.reward.coins],
  );
  await client.query(
    `update users set stars = stars + $2, experience = experience + $3 where id = $1`,
    [input.userId, input.reward.stars, input.reward.experience],
  );
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'tournament_reward', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      input.reward.coins,
      Number(account.rows[0]!.balance),
      Number(account.rows[0]!.reserved_balance),
      JSON.stringify({
        tournament_id: input.tournamentId,
        participant_id: input.participantId,
        stage: input.stage,
        place: input.place,
        stars: input.reward.stars,
        experience: input.reward.experience,
      }),
    ],
  );
  await client.query(
    `update tournament_economy_event set status = 'applied', applied_at = now() where id = $1`,
    [event.rows[0]!.id],
  );
  return true;
}

export async function grantTournamentStageRewards(
  pool: Pool,
  tournamentId: string,
  stage: 'regular' | 'playoff',
) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `tournament:${tournamentId}`,
    ]);
    const tournament = await client.query<{
      title: string;
      rules_snapshot: Record<string, unknown>;
    }>(
      `select t.title, r.rules_snapshot from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    if (!tournament.rows[0]) throw new AppError('not_found', 'tournament not found', 404);
    const rewardConfig = tournament.rows[0].rules_snapshot.stageRewards;
    const rewardRecord =
      typeof rewardConfig === 'object' && rewardConfig !== null
        ? (rewardConfig as Record<string, unknown>)
        : {};
    const rewards = parseRewards(rewardRecord[stage]);
    let placements: Array<{ place: number; participant_id: string; user_id: string }>;
    if (stage === 'regular') {
      const result = await client.query<{ place: number; participant_id: string; user_id: string }>(
        `select s.rank as place, s.participant_id, p.user_id
           from tournament_standing s join tournament_participant p on p.id = s.participant_id
          where s.tournament_id = $1 and s.rank is not null`,
        [tournamentId],
      );
      placements = result.rows;
    } else {
      const series = await client.query<{
        kind: 'championship' | 'third_place';
        higher_seed_participant_id: string;
        lower_seed_participant_id: string;
        winner_participant_id: string;
        round_number: number;
      }>(
        `select s.kind, s.higher_seed_participant_id, s.lower_seed_participant_id,
                s.winner_participant_id, r.number as round_number
           from tournament_playoff_series s join tournament_round r on r.id = s.round_id
          where s.tournament_id = $1 and s.status = 'completed'
          order by r.number desc`,
        [tournamentId],
      );
      const final = series.rows.find((row) => row.kind === 'championship');
      if (!final) throw new AppError('conflict', 'playoff final is not complete', 409);
      const bronze = series.rows.find((row) => row.kind === 'third_place');
      const config = tournament.rows[0].rules_snapshot.config;
      const playoffSize =
        typeof config === 'object' && config !== null
          ? Number((config as Record<string, unknown>).playoffSize ?? 0)
          : 0;
      if (playoffSize >= 4 && !bronze) {
        throw new AppError('conflict', 'third-place series is not complete', 409);
      }
      const resolved = resolvePlayoffPlacements({
        final: {
          higherId: final.higher_seed_participant_id,
          lowerId: final.lower_seed_participant_id,
          winnerId: final.winner_participant_id,
        },
        ...(bronze
          ? {
              bronze: {
                higherId: bronze.higher_seed_participant_id,
                lowerId: bronze.lower_seed_participant_id,
                winnerId: bronze.winner_participant_id,
              },
            }
          : {}),
      });
      const users = await client.query<{ id: string; user_id: string }>(
        `select id, user_id from tournament_participant where tournament_id = $1`,
        [tournamentId],
      );
      const userByParticipant = new Map(users.rows.map((row) => [row.id, row.user_id]));
      placements = resolved.map((row) => ({
        place: row.place,
        participant_id: row.participantId,
        user_id: userByParticipant.get(row.participantId)!,
      }));
    }
    let granted = 0;
    for (const reward of rewards) {
      const placement = placements.find((row) => Number(row.place) === reward.place);
      if (!placement) continue;
      if (
        await grantOne(client, {
          tournamentId,
          participantId: placement.participant_id,
          userId: placement.user_id,
          stage,
          place: reward.place,
          reward,
        })
      ) {
        granted += 1;
      }
    }
    if (stage === 'playoff') {
      await client.query(
        `update tournament set status = 'completed', completed_at = now(), updated_at = now()
          where id = $1 and status = 'playoff'`,
        [tournamentId],
      );
      await enqueueTournamentAudiencePush(client, {
        tournamentId,
        eventType: 'tournament.completed',
        eventKey: `${tournamentId}:completed`,
        variables: { tournamentTitle: tournament.rows[0]!.title },
        fallback: {
          title: 'Турнир завершён',
          body: `${tournament.rows[0]!.title} завершён. Проверьте итоги и награды.`,
          url: '/?view=amateur&section=tournaments',
        },
      });
    }
    await client.query('commit');
    return { tournamentId, stage, granted };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
