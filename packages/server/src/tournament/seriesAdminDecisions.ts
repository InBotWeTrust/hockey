import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { forceTournamentPlayoffSeriesWinner } from './playoffSeriesLifecycle.js';

interface DecisionRow {
  id: string;
  series_id: string;
  tournament_id: string;
  winner_participant_id: string;
  reason: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  factual_score_snapshot: {
    higherSeedWins: number;
    lowerSeedWins: number;
  };
  requested_at: Date;
  confirmed_at: Date | null;
}

export interface TournamentSeriesAdminDecisionDTO {
  id: string;
  seriesId: string;
  winnerParticipantId: string;
  reason: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  factualScore: { higherSeedWins: number; lowerSeedWins: number };
  requestedAt: string;
  confirmedAt: string | null;
}

function dto(row: DecisionRow): TournamentSeriesAdminDecisionDTO {
  return {
    id: row.id,
    seriesId: row.series_id,
    winnerParticipantId: row.winner_participant_id,
    reason: row.reason,
    status: row.status,
    factualScore: row.factual_score_snapshot,
    requestedAt: row.requested_at.toISOString(),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
  };
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

export async function requestTournamentSeriesWinnerDecision(
  pool: Pool,
  input: {
    tournamentId: string;
    seriesId: string;
    winnerParticipantId: string;
    reason: string;
    idempotencyKey: string;
    adminUserId: string;
  },
): Promise<TournamentSeriesAdminDecisionDTO> {
  return transaction(pool, async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `tournament:${input.tournamentId}`,
    ]);
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `tournament-series:${input.seriesId}`,
    ]);
    const series = await client.query<{
      higher_seed_participant_id: string | null;
      lower_seed_participant_id: string | null;
      higher_seed_wins: number;
      lower_seed_wins: number;
      status: string;
    }>(
      `select higher_seed_participant_id, lower_seed_participant_id,
              higher_seed_wins, lower_seed_wins, status
         from tournament_playoff_series
        where id = $1 and tournament_id = $2
        for update`,
      [input.seriesId, input.tournamentId],
    );
    const current = series.rows[0];
    if (current === undefined) throw new AppError('not_found', 'series not found', 404);
    if (current.status === 'completed' || current.status === 'cancelled') {
      throw new AppError('conflict', 'series is already finished', 409);
    }
    if (
      input.winnerParticipantId !== current.higher_seed_participant_id &&
      input.winnerParticipantId !== current.lower_seed_participant_id
    ) {
      throw new AppError('bad_request', 'winner is not a series participant', 400);
    }
    const factualScore = {
      higherSeedWins: Number(current.higher_seed_wins),
      lowerSeedWins: Number(current.lower_seed_wins),
    };
    await client.query(
      `insert into tournament_series_admin_decision
         (series_id, winner_participant_id, reason, requested_by,
          factual_score_snapshot, idempotency_key)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       on conflict (idempotency_key) do nothing`,
      [
        input.seriesId,
        input.winnerParticipantId,
        input.reason,
        input.adminUserId,
        JSON.stringify(factualScore),
        input.idempotencyKey,
      ],
    );
    const decision = await client.query<DecisionRow>(
      `select decision.id, decision.series_id, series.tournament_id,
              decision.winner_participant_id, decision.reason, decision.status,
              decision.factual_score_snapshot, decision.requested_at, decision.confirmed_at
         from tournament_series_admin_decision decision
         join tournament_playoff_series series on series.id = decision.series_id
        where decision.idempotency_key = $1`,
      [input.idempotencyKey],
    );
    const row = decision.rows[0]!;
    if (
      row.series_id !== input.seriesId ||
      row.tournament_id !== input.tournamentId ||
      row.winner_participant_id !== input.winnerParticipantId ||
      row.reason !== input.reason
    ) {
      throw new AppError('conflict', 'idempotency key belongs to another decision', 409);
    }
    return dto(row);
  });
}

export async function confirmTournamentSeriesWinnerDecision(
  pool: Pool,
  input: {
    tournamentId: string;
    seriesId: string;
    decisionId: string;
    adminUserId: string;
  },
): Promise<TournamentSeriesAdminDecisionDTO> {
  const settledAt = new Date();
  return transaction(pool, async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `tournament:${input.tournamentId}`,
    ]);
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [
      `tournament-series:${input.seriesId}`,
    ]);
    const decision = await client.query<DecisionRow>(
      `select decision.id, decision.series_id, series.tournament_id,
              decision.winner_participant_id, decision.reason, decision.status,
              decision.factual_score_snapshot, decision.requested_at, decision.confirmed_at
         from tournament_series_admin_decision decision
         join tournament_playoff_series series on series.id = decision.series_id
        where decision.id = $1 and decision.series_id = $2 and series.tournament_id = $3
        for update of decision, series`,
      [input.decisionId, input.seriesId, input.tournamentId],
    );
    const row = decision.rows[0];
    if (row === undefined) throw new AppError('not_found', 'series decision not found', 404);
    if (row.status === 'confirmed') return dto(row);
    if (row.status !== 'pending') {
      throw new AppError('conflict', 'series decision is not pending', 409);
    }
    const confirmed = await client.query<DecisionRow>(
      `update tournament_series_admin_decision decision
          set status = 'confirmed', confirmed_by = $2, confirmed_at = now(), updated_at = now()
        where decision.id = $1 and decision.status = 'pending'
        returning decision.id, decision.series_id, $3::uuid as tournament_id,
                  decision.winner_participant_id, decision.reason, decision.status,
                  decision.factual_score_snapshot, decision.requested_at, decision.confirmed_at`,
      [row.id, input.adminUserId, input.tournamentId],
    );
    const completed = await forceTournamentPlayoffSeriesWinner(client, {
      seriesId: input.seriesId,
      winnerParticipantId: row.winner_participant_id,
      settledAt,
    });
    if (!completed.completed) {
      throw new AppError('conflict', 'series winner cannot be applied', 409);
    }
    await client.query(
      `update tournament_incident
          set status = 'resolved', resolved_at = now(), resolved_by = $2, updated_at = now()
        where series_id = $1 and status = 'open'`,
      [input.seriesId, input.adminUserId],
    );
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, participant_id, kind, payload, reason, created_by)
       values ($1, $2, 'incident_resolution', $3::jsonb, $4, $5)`,
      [
        input.tournamentId,
        row.winner_participant_id,
        JSON.stringify({
          seriesDecisionId: row.id,
          seriesId: input.seriesId,
          winnerParticipantId: row.winner_participant_id,
          factualScore: row.factual_score_snapshot,
        }),
        row.reason,
        input.adminUserId,
      ],
    );
    return dto(confirmed.rows[0]!);
  });
}
