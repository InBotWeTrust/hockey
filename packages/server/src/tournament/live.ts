import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';

export interface TournamentRealtimeEvent {
  type: 'tournament:fixture_update' | 'tournament:presence';
  fixtureId: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export interface TournamentFixtureLiveState {
  fixtureId: string;
  status: string;
  score: { home: number; away: number };
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  proposal: {
    id: string;
    proposedAt: string | null;
    proposedByUserId: string | null;
    state: string | null;
  } | null;
  overlapWarnings: TournamentFixtureLiveOverlapWarning[];
  duelMatchId: string | null;
  participants: Array<{
    userId: string;
    state: string;
    currentPeriod: number;
    goals: number;
    shotsTaken: number;
  }>;
}

export interface TournamentFixtureLiveOverlapWarning {
  fixtureId: string;
  tournamentId: string;
  tournamentTitle: string;
  scheduledStartsAt: string | null;
  windowEndsAt: string | null;
  acceptedLiveAt: string | null;
}

interface TournamentFixtureLiveProposalResult {
  id: string;
  fixtureId: string;
  proposedAt: string;
  state: 'pending';
  overlapWarnings: TournamentFixtureLiveOverlapWarning[];
}

interface TournamentFixtureLiveProposalResponse {
  fixtureId: string;
  proposalId: string;
  state: 'accepted' | 'declined';
  overlapWarnings: TournamentFixtureLiveOverlapWarning[];
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function fixtureParticipant(
  client: Pool | PoolClient,
  fixtureId: string,
  userId: string,
  forUpdate = false,
) {
  const { rows } = await client.query<{
    fixture_id: string;
    home_user_id: string | null;
    away_user_id: string | null;
    scheduled_starts_at: Date | null;
    window_ends_at: Date | null;
  }>(
    `select f.id as fixture_id, hp.user_id as home_user_id, ap.user_id as away_user_id,
            f.scheduled_starts_at, f.window_ends_at
       from tournament_fixture f
       left join tournament_participant hp on hp.id = f.home_participant_id
       left join tournament_participant ap on ap.id = f.away_participant_id
      where f.id = $1 ${forUpdate ? 'for update of f' : ''}`,
    [fixtureId],
  );
  const fixture = rows[0];
  if (!fixture) throw new AppError('not_found', 'fixture not found', 404);
  if (fixture.home_user_id !== userId && fixture.away_user_id !== userId) {
    throw new AppError('forbidden', 'fixture participant required', 403);
  }
  return fixture;
}

export async function assertFixtureParticipant(pool: Pool, fixtureId: string, userId: string) {
  return fixtureParticipant(pool, fixtureId, userId);
}

async function assertPlayerTimeProposalAllowed(
  client: PoolClient,
  fixtureId: string,
): Promise<void> {
  const attempt = await client.query<{ exists: boolean }>(
    `select exists(
       select 1 from tournament_fixture_attempt where fixture_id = $1
     ) as exists`,
    [fixtureId],
  );
  if (attempt.rows[0]?.exists === true) {
    throw new AppError('conflict', 'Время турнирной игры назначает администратор', 409);
  }
}

async function getFixtureLiveOverlapWarnings(
  client: Pool | PoolClient,
  input: { fixtureId: string; proposedAt: Date },
): Promise<TournamentFixtureLiveOverlapWarning[]> {
  const { rows } = await client.query<{
    fixture_id: string;
    tournament_id: string;
    tournament_title: string;
    scheduled_starts_at: Date | null;
    window_ends_at: Date | null;
    accepted_live_at: Date | null;
  }>(
    `with current_fixture as (
       select home_participant.user_id as home_user_id, away_participant.user_id as away_user_id
         from tournament_fixture fixture
         left join tournament_participant home_participant on home_participant.id = fixture.home_participant_id
         left join tournament_participant away_participant on away_participant.id = fixture.away_participant_id
        where fixture.id = $1
     )
     select fixture.id as fixture_id, fixture.tournament_id, tournament.title as tournament_title,
            fixture.scheduled_starts_at, fixture.window_ends_at,
            accepted_proposal.proposed_at as accepted_live_at
       from tournament_fixture fixture
       join tournament on tournament.id = fixture.tournament_id
       left join tournament_participant home_participant on home_participant.id = fixture.home_participant_id
       left join tournament_participant away_participant on away_participant.id = fixture.away_participant_id
       left join lateral (
         select proposal.proposed_at
           from tournament_live_proposal proposal
          where proposal.fixture_id = fixture.id
            and proposal.state = 'accepted'
            and proposal.proposed_at = $2
          order by proposal.responded_at desc nulls last, proposal.created_at desc
          limit 1
       ) accepted_proposal on true
       cross join current_fixture current
      where fixture.id <> $1
        and fixture.status not in ('settled', 'forfeit', 'cancelled')
        and (
          home_participant.user_id in (current.home_user_id, current.away_user_id)
          or away_participant.user_id in (current.home_user_id, current.away_user_id)
        )
        and (
          accepted_proposal.proposed_at is not null
          or (
            fixture.scheduled_starts_at is not null
            and fixture.window_ends_at is not null
            and fixture.scheduled_starts_at <= $2
            and $2 < fixture.window_ends_at
          )
        )
      order by fixture.scheduled_starts_at nulls last, fixture.id`,
    [input.fixtureId, input.proposedAt],
  );
  return rows.map((row) => ({
    fixtureId: row.fixture_id,
    tournamentId: row.tournament_id,
    tournamentTitle: row.tournament_title,
    scheduledStartsAt: row.scheduled_starts_at?.toISOString() ?? null,
    windowEndsAt: row.window_ends_at?.toISOString() ?? null,
    acceptedLiveAt: row.accepted_live_at?.toISOString() ?? null,
  }));
}

export async function proposeFixtureLiveTime(
  pool: Pool,
  input: { fixtureId: string; userId: string; proposedAt: Date },
): Promise<TournamentFixtureLiveProposalResult> {
  return transaction(pool, async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `fixture-live:${input.fixtureId}`,
    ]);
    const fixture = await fixtureParticipant(client, input.fixtureId, input.userId, true);
    await assertPlayerTimeProposalAllowed(client, input.fixtureId);
    if (
      fixture.scheduled_starts_at === null ||
      fixture.window_ends_at === null ||
      input.proposedAt < fixture.scheduled_starts_at ||
      input.proposedAt >= fixture.window_ends_at
    ) {
      throw new AppError('bad_request', 'live time must be inside fixture window', 400);
    }
    await client.query(
      `update tournament_live_proposal set state = 'superseded'
        where fixture_id = $1 and state in ('pending', 'accepted')`,
      [input.fixtureId],
    );
    const participant = await client.query<{ id: string }>(
      `select p.id from tournament_participant p
         join tournament_fixture f on f.tournament_id = p.tournament_id
        where f.id = $1 and p.user_id = $2`,
      [input.fixtureId, input.userId],
    );
    const proposal = await client.query<{ id: string }>(
      `insert into tournament_live_proposal
         (fixture_id, proposed_by_participant_id, proposed_at)
       values ($1, $2, $3) returning id`,
      [input.fixtureId, participant.rows[0]!.id, input.proposedAt],
    );
    return {
      id: proposal.rows[0]!.id,
      fixtureId: input.fixtureId,
      proposedAt: input.proposedAt.toISOString(),
      state: 'pending',
      overlapWarnings: await getFixtureLiveOverlapWarnings(client, input),
    };
  });
}

export async function respondFixtureLiveProposal(
  pool: Pool,
  input: { fixtureId: string; proposalId: string; userId: string; accept: boolean },
): Promise<TournamentFixtureLiveProposalResponse> {
  return transaction(pool, async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `fixture-live:${input.fixtureId}`,
    ]);
    await fixtureParticipant(client, input.fixtureId, input.userId, true);
    await assertPlayerTimeProposalAllowed(client, input.fixtureId);
    const responder = await client.query<{ id: string }>(
      `select p.id from tournament_participant p
         join tournament_fixture f on f.tournament_id = p.tournament_id
        where f.id = $1 and p.user_id = $2`,
      [input.fixtureId, input.userId],
    );
    const proposal = await client.query<{
      proposed_at: Date;
      proposed_by_participant_id: string;
    }>(
      `update tournament_live_proposal
          set state = $4, responded_by_participant_id = $3, responded_at = now()
        where id = $1 and fixture_id = $2 and state = 'pending'
          and proposed_by_participant_id <> $3
        returning proposed_at, proposed_by_participant_id`,
      [
        input.proposalId,
        input.fixtureId,
        responder.rows[0]!.id,
        input.accept ? 'accepted' : 'declined',
      ],
    );
    if (!proposal.rows[0]) throw new AppError('conflict', 'proposal is no longer actionable', 409);
    if (input.accept) {
      await client.query(
        `update tournament_fixture set scheduled_starts_at = $2, updated_at = now() where id = $1`,
        [input.fixtureId, proposal.rows[0].proposed_at],
      );
    }
    return {
      fixtureId: input.fixtureId,
      proposalId: input.proposalId,
      state: input.accept ? 'accepted' : 'declined',
      overlapWarnings: input.accept
        ? await getFixtureLiveOverlapWarnings(client, {
            fixtureId: input.fixtureId,
            proposedAt: proposal.rows[0].proposed_at,
          })
        : [],
    };
  });
}

export async function getFixtureLiveSnapshot(
  pool: Pool,
  fixtureId: string,
): Promise<TournamentFixtureLiveState | null> {
  const { rows } = await pool.query<{
    id: string;
    status: string;
    home_score: number;
    away_score: number;
    scheduled_starts_at: Date | null;
    window_ends_at: Date | null;
    proposal_id: string | null;
    proposed_at: Date | null;
    proposal_state: string | null;
    proposed_by_user_id: string | null;
    duel_match_id: string | null;
    participants: Array<{
      userId: string;
      state: string;
      currentPeriod: number;
      goals: number;
      shotsTaken: number;
    }>;
  }>(
    `select f.id, f.status, f.home_score, f.away_score, f.scheduled_starts_at,
            f.window_ends_at, p.id as proposal_id, p.proposed_at, p.state as proposal_state,
            proposer.user_id as proposed_by_user_id,
            m.id as duel_match_id,
            coalesce(jsonb_agg(jsonb_build_object(
              'userId', dp.user_id, 'state', dp.state, 'currentPeriod', dp.current_period,
              'goals', dp.goals, 'shotsTaken', dp.shots_taken
            )) filter (where dp.user_id is not null), '[]'::jsonb) as participants
       from tournament_fixture f
       left join lateral (
         select proposal.*
           from tournament_live_proposal proposal
          where proposal.fixture_id = f.id and proposal.state in ('pending', 'accepted')
          order by proposal.created_at desc, proposal.id desc
          limit 1
       ) p on true
       left join tournament_participant proposer on proposer.id = p.proposed_by_participant_id
       left join tournament_fixture_segment s on s.fixture_id = f.id and s.status in ('scheduled', 'active')
       left join amateur_duel_match m on m.id = s.duel_match_id
       left join amateur_duel_participant dp on dp.match_id = m.id
      where f.id = $1
      group by f.id, p.id, p.proposed_at, p.state, p.proposed_by_participant_id,
               proposer.user_id, m.id`,
    [fixtureId],
  );
  const row = rows[0];
  if (!row) return null;
  const overlapWarnings =
    row.proposal_id === null || row.proposed_at === null
      ? []
      : await getFixtureLiveOverlapWarnings(pool, {
          fixtureId: row.id,
          proposedAt: row.proposed_at,
        });
  return {
    fixtureId: row.id,
    status: row.status,
    score: { home: Number(row.home_score), away: Number(row.away_score) },
    scheduledStartsAt: row.scheduled_starts_at?.toISOString() ?? null,
    windowEndsAt: row.window_ends_at?.toISOString() ?? null,
    proposal:
      row.proposal_id === null
        ? null
        : {
            id: row.proposal_id,
            proposedAt: row.proposed_at?.toISOString() ?? null,
            proposedByUserId: row.proposed_by_user_id,
            state: row.proposal_state,
          },
    overlapWarnings,
    duelMatchId: row.duel_match_id,
    participants: row.participants.map((participant) => ({
      userId: participant.userId,
      state: participant.state,
      currentPeriod: Number(participant.currentPeriod),
      goals: Number(participant.goals),
      shotsTaken: Number(participant.shotsTaken),
    })),
  };
}

export async function getFixtureLiveState(pool: Pool, fixtureId: string, userId: string) {
  await assertFixtureParticipant(pool, fixtureId, userId);
  return getFixtureLiveSnapshot(pool, fixtureId);
}
