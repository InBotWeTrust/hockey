import type { Pool, PoolClient } from 'pg';
import { AppError } from '../plugins/errors.js';
import { decideTournamentApplication, evaluateTournamentEligibility } from './registration.js';
import { buildHeadToHeadSchedulePlan } from './materialize.js';
import {
  buildPlayoffSeriesPlan,
  buildPlayoffFixtureWindows,
  expandSeriesSchedule,
  type HomeDesignation,
  type PlayoffParticipantSource,
} from './playoffs.js';
import { rebuildHeadToHeadStandings } from './standingsPersistence.js';
import { advanceTournamentPlayoffSeries } from './playoffSeriesLifecycle.js';
import {
  enqueueTournamentFixtureResultPush,
  enqueueTournamentSeriesNextGamePush,
} from './fixtureNotifications.js';
import { lockTournament, lockTournamentFixture } from './locks.js';
import type { TournamentConfig, TournamentStatus } from './types.js';

export interface TournamentRulesSnapshot {
  config: TournamentConfig;
  eligibility: {
    minLevel: number | null;
    maxLevel: number | null;
    minGoals: number;
    minExperience: number;
    invitedUserIds: string[];
    bannedUserIds: string[];
  };
  [key: string]: unknown;
}

interface TournamentRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: TournamentStatus;
  regular_source: TournamentConfig['regularSource'];
  visibility: 'public' | 'hidden';
  current_revision: number;
  published_revision_id: string | null;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  starts_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  rules_snapshot: TournamentRulesSnapshot;
  participant_count: number;
  my_participant_state?: string | null;
}

function mapTournament(row: TournamentRow) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    regularSource: row.regular_source,
    visibility: row.visibility,
    revision: Number(row.current_revision),
    publishedRevisionId: row.published_revision_id,
    registrationOpensAt: row.registration_opens_at?.toISOString() ?? null,
    registrationClosesAt: row.registration_closes_at?.toISOString() ?? null,
    startsAt: row.starts_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    participantCount: Number(row.participant_count),
    rules: row.rules_snapshot,
    ...(row.my_participant_state !== undefined
      ? { myParticipantState: row.my_participant_state }
      : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

const tournamentSelect = `
  select t.*, r.rules_snapshot,
         (select count(*)::int from tournament_participant p
           where p.tournament_id = t.id and p.state = 'approved') as participant_count
    from tournament t
    join tournament_revision r
      on r.tournament_id = t.id and r.revision = t.current_revision`;

export async function isTournamentFeatureEnabled(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ enabled: boolean }>(
    `select coalesce((value #>> '{}')::boolean, false) as enabled
       from game_settings where key = 'tournaments.enabled'`,
  );
  return rows[0]?.enabled === true;
}

export async function createTournamentDraft(
  pool: Pool,
  input: {
    slug: string;
    title: string;
    description: string;
    rules: TournamentRulesSnapshot;
    createdBy: string;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    startsAt: Date | null;
  },
) {
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<TournamentRow>(
      `insert into tournament
         (slug, title, description, regular_source, visibility, current_revision,
          registration_opens_at, registration_closes_at, starts_at, created_by, updated_by)
       values ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $9)
       returning *, 0::int as participant_count, $10::jsonb as rules_snapshot`,
      [
        input.slug,
        input.title,
        input.description,
        input.rules.config.regularSource,
        input.rules.config.visibility,
        input.registrationOpensAt,
        input.registrationClosesAt,
        input.startsAt,
        input.createdBy,
        JSON.stringify(input.rules),
      ],
    );
    const tournament = rows[0]!;
    await client.query(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, created_by)
       values ($1, 1, $2, $3)`,
      [tournament.id, JSON.stringify(input.rules), input.createdBy],
    );
    return mapTournament(tournament);
  });
}

export async function listAdminTournaments(pool: Pool) {
  const { rows } = await pool.query<TournamentRow>(
    `${tournamentSelect} order by t.created_at desc`,
  );
  return rows.map(mapTournament);
}

export async function listPlayerTournaments(pool: Pool, userId: string) {
  const { rows } = await pool.query<TournamentRow & { my_participant_state: string | null }>(
    `select listed.*, mine.state as my_participant_state
       from (${tournamentSelect}) listed
       left join tournament_participant mine
         on mine.tournament_id = listed.id and mine.user_id = $1
      where listed.status not in ('draft', 'archived')
        and (listed.visibility = 'public' or mine.id is not null)
      order by listed.starts_at nulls last, listed.created_at desc`,
    [userId],
  );
  return rows.map(mapTournament);
}

export async function getTournament(pool: Pool, tournamentId: string, userId?: string) {
  const values: unknown[] = [tournamentId];
  const mineSelect =
    userId === undefined
      ? 'null::text as my_participant_state'
      : `(select state from tournament_participant where tournament_id = t.id and user_id = $2)
           as my_participant_state`;
  if (userId !== undefined) values.push(userId);
  const { rows } = await pool.query<TournamentRow>(
    `${tournamentSelect.replace('select t.*,', `select t.*, ${mineSelect},`)} where t.id = $1`,
    values,
  );
  const row = rows[0];
  if (!row) throw new AppError('not_found', 'tournament not found', 404);
  if (userId !== undefined && row.visibility === 'hidden' && row.my_participant_state === null) {
    throw new AppError('not_found', 'tournament not found', 404);
  }
  return mapTournament(row);
}

export async function updateTournamentDraft(
  pool: Pool,
  input: {
    tournamentId: string;
    expectedRevision: number;
    title: string;
    description: string;
    rules: TournamentRulesSnapshot;
    updatedBy: string;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    startsAt: Date | null;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const current = await client.query<{ status: TournamentStatus; current_revision: number }>(
      `select status, current_revision from tournament where id = $1 for update`,
      [input.tournamentId],
    );
    const tournament = current.rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.status !== 'draft') {
      throw new AppError('conflict', 'published tournament rules are immutable', 409);
    }
    if (Number(tournament.current_revision) !== input.expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    const revision = input.expectedRevision + 1;
    await client.query(
      `insert into tournament_revision
         (tournament_id, revision, rules_snapshot, created_by)
       values ($1, $2, $3, $4)`,
      [input.tournamentId, revision, JSON.stringify(input.rules), input.updatedBy],
    );
    await client.query(
      `update tournament
          set title = $2, description = $3, regular_source = $4, visibility = $5,
              current_revision = $6, registration_opens_at = $7,
              registration_closes_at = $8, starts_at = $9, updated_by = $10,
              updated_at = now()
        where id = $1`,
      [
        input.tournamentId,
        input.title,
        input.description,
        input.rules.config.regularSource,
        input.rules.config.visibility,
        revision,
        input.registrationOpensAt,
        input.registrationClosesAt,
        input.startsAt,
        input.updatedBy,
      ],
    );
    const updated = await client.query<TournamentRow>(`${tournamentSelect} where t.id = $1`, [
      input.tournamentId,
    ]);
    return mapTournament(updated.rows[0]!);
  });
}

export async function publishTournament(
  pool: Pool,
  tournamentId: string,
  expectedRevision: number,
  userId: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const { rows } = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      revision_id: string;
    }>(
      `select t.status, t.current_revision, r.id as revision_id
         from tournament t
         join tournament_revision r
           on r.tournament_id = t.id and r.revision = t.current_revision
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.status !== 'draft')
      throw new AppError('conflict', 'tournament is published', 409);
    if (Number(tournament.current_revision) !== expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    await client.query(
      `update tournament_revision set is_published = true, published_at = now()
        where id = $1`,
      [tournament.revision_id],
    );
    await client.query(
      `update tournament
          set status = 'registration', published_revision_id = $2,
              updated_by = $3, updated_at = now()
        where id = $1`,
      [tournamentId, tournament.revision_id, userId],
    );
    return { tournamentId, status: 'registration' as const, revision: expectedRevision };
  });
}

async function applyEntryFee(
  client: PoolClient,
  input: { tournamentId: string; participantId: string; userId: string; amount: number },
): Promise<void> {
  if (input.amount === 0) return;
  const key = `tournament:${input.tournamentId}:entry:${input.userId}`;
  const inserted = await client.query(
    `insert into tournament_economy_event
       (tournament_id, participant_id, idempotency_key, kind, coins)
     values ($1, $2, $3, 'entry_fee', $4)
     on conflict (idempotency_key) do nothing
     returning id`,
    [input.tournamentId, input.participantId, key, input.amount],
  );
  if (inserted.rowCount === 0) return;
  await client.query('select id from users where id = $1 for update', [input.userId]);
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [input.userId],
  );
  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account set balance = balance - $2, updated_at = now()
      where user_id = $1 and balance >= $2 returning balance, reserved_balance`,
    [input.userId, input.amount],
  );
  if (!account.rows[0]) throw new AppError('insufficient_coins', 'not enough coins', 409);
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'tournament_entry_fee', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      -input.amount,
      Number(account.rows[0].balance),
      Number(account.rows[0].reserved_balance),
      JSON.stringify({ tournament_id: input.tournamentId, participant_id: input.participantId }),
    ],
  );
  await client.query(
    `update tournament_economy_event set status = 'applied', applied_at = now() where id = $1`,
    [inserted.rows[0].id],
  );
  await client.query(
    `update tournament_participant set entry_fee_state = 'paid', updated_at = now() where id = $1`,
    [input.participantId],
  );
}

export async function applyToTournament(pool: Pool, tournamentId: string, userId: string) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const { rows } = await client.query<{
      status: TournamentStatus;
      registration_opens_at: Date | null;
      registration_closes_at: Date | null;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, t.registration_opens_at, t.registration_closes_at, r.rules_snapshot
         from tournament t join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (tournament.status !== 'registration') {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const now = new Date();
    if (
      (tournament.registration_opens_at !== null && now < tournament.registration_opens_at) ||
      (tournament.registration_closes_at !== null && now >= tournament.registration_closes_at)
    ) {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const existing = await client.query<{ id: string; state: string }>(
      `select id, state from tournament_participant where tournament_id = $1 and user_id = $2`,
      [tournamentId, userId],
    );
    const invited = existing.rows[0]?.state === 'invited';
    if (existing.rows[0] && !invited)
      throw new AppError('conflict', 'application already exists', 409);
    const playerResult = await client.query<{
      level: number;
      lifetime_goals_total: number;
      experience: number;
    }>(`select level, lifetime_goals_total, experience from users where id = $1`, [userId]);
    const player = playerResult.rows[0];
    if (!player) throw new AppError('not_found', 'user not found', 404);
    const approved = await client.query<{ count: string }>(
      `select count(*)::text as count from tournament_participant
        where tournament_id = $1 and state = 'approved'`,
      [tournamentId],
    );
    const rules = tournament.rules_snapshot;
    const eligibility = evaluateTournamentEligibility(
      {
        userId,
        level: Number(player.level),
        goals: Number(player.lifetime_goals_total),
        experience: Number(player.experience),
      },
      rules.eligibility,
    );
    const decision = decideTournamentApplication({
      mode: rules.config.registrationMode,
      invited,
      eligible: eligibility.eligible,
      approvedParticipants: Number(approved.rows[0]?.count ?? 0),
      participantLimit: rules.config.participantLimit,
    });
    if (!decision.accepted) throw new AppError(decision.reason, decision.reason, 409);
    const participant = await client.query<{ id: string }>(
      `insert into tournament_participant
         (tournament_id, user_id, state, entry_fee_coins, entry_fee_state, joined_at)
       values ($1, $2, $3, $4, $5, case when $3 = 'approved' then now() else null end)
       on conflict (tournament_id, user_id) do update
         set state = excluded.state, entry_fee_coins = excluded.entry_fee_coins,
             entry_fee_state = excluded.entry_fee_state, joined_at = excluded.joined_at,
             updated_at = now()
       returning id`,
      [
        tournamentId,
        userId,
        decision.state,
        rules.config.entryFeeCoins,
        rules.config.entryFeeCoins === 0 ? 'not_required' : 'pending',
      ],
    );
    if (decision.state === 'approved') {
      await applyEntryFee(client, {
        tournamentId,
        participantId: participant.rows[0]!.id,
        userId,
        amount: rules.config.entryFeeCoins,
      });
    }
    return { tournamentId, participantId: participant.rows[0]!.id, state: decision.state };
  });
}

export async function deleteEmptyDraft(pool: Pool, tournamentId: string): Promise<void> {
  const result = await pool.query(
    `delete from tournament t
      where t.id = $1 and t.status = 'draft'
        and not exists (select 1 from tournament_participant p where p.tournament_id = t.id)`,
    [tournamentId],
  );
  if (result.rowCount === 0) {
    throw new AppError('conflict', 'only an empty draft can be deleted', 409);
  }
}

async function refundEntryFee(
  client: PoolClient,
  input: { tournamentId: string; participantId: string; userId: string; amount: number },
): Promise<void> {
  if (input.amount === 0) return;
  const key = `tournament:${input.tournamentId}:refund:${input.userId}`;
  const inserted = await client.query<{ id: string }>(
    `insert into tournament_economy_event
       (tournament_id, participant_id, idempotency_key, kind, coins)
     values ($1, $2, $3, 'entry_refund', $4)
     on conflict (idempotency_key) do nothing returning id`,
    [input.tournamentId, input.participantId, key, input.amount],
  );
  if (inserted.rowCount === 0) return;
  await client.query('select id from users where id = $1 for update', [input.userId]);
  await client.query(
    `insert into user_currency_account (user_id) values ($1) on conflict do nothing`,
    [input.userId],
  );
  const account = await client.query<{ balance: number; reserved_balance: number }>(
    `update user_currency_account set balance = balance + $2, updated_at = now()
      where user_id = $1 returning balance, reserved_balance`,
    [input.userId, input.amount],
  );
  await client.query(
    `insert into currency_ledger
       (user_id, reason, available_delta, reserved_delta, balance_after, reserved_after, metadata)
     values ($1, 'tournament_entry_refund', $2, 0, $3, $4, $5)`,
    [
      input.userId,
      input.amount,
      Number(account.rows[0]!.balance),
      Number(account.rows[0]!.reserved_balance),
      JSON.stringify({ tournament_id: input.tournamentId, participant_id: input.participantId }),
    ],
  );
  await client.query(
    `update tournament_economy_event set status = 'applied', applied_at = now() where id = $1`,
    [inserted.rows[0]!.id],
  );
  await client.query(
    `update tournament_participant set entry_fee_state = 'refunded', updated_at = now() where id = $1`,
    [input.participantId],
  );
}

export async function withdrawTournamentApplication(
  pool: Pool,
  tournamentId: string,
  userId: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{ status: TournamentStatus }>(
      `select status from tournament where id = $1 for update`,
      [tournamentId],
    );
    if (!tournament.rows[0]) throw new AppError('not_found', 'tournament not found', 404);
    if (!['registration', 'registration_blocked'].includes(tournament.rows[0].status)) {
      throw new AppError('conflict', 'application can no longer be withdrawn', 409);
    }
    const participantResult = await client.query<{
      id: string;
      state: string;
      entry_fee_coins: number;
      entry_fee_state: string;
    }>(
      `select id, state, entry_fee_coins, entry_fee_state
         from tournament_participant
        where tournament_id = $1 and user_id = $2 for update`,
      [tournamentId, userId],
    );
    const participant = participantResult.rows[0];
    if (!participant || !['applied', 'approved', 'invited'].includes(participant.state)) {
      throw new AppError('conflict', 'active application not found', 409);
    }
    if (participant.entry_fee_state === 'paid') {
      await refundEntryFee(client, {
        tournamentId,
        participantId: participant.id,
        userId,
        amount: Number(participant.entry_fee_coins),
      });
    }
    await client.query(
      `update tournament_participant
          set state = 'withdrawn', withdrawn_at = now(), updated_at = now()
        where id = $1`,
      [participant.id],
    );
    return { tournamentId, state: 'withdrawn' as const };
  });
}

export async function inviteTournamentParticipant(
  pool: Pool,
  tournamentId: string,
  userId: string,
  invitedBy: string,
) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into tournament_participant
       (tournament_id, user_id, state, invited_by)
     values ($1, $2, 'invited', $3)
     on conflict (tournament_id, user_id) do update
       set state = case
             when tournament_participant.state in ('rejected', 'declined', 'withdrawn')
             then 'invited' else tournament_participant.state end,
           invited_by = $3, updated_at = now()
     returning id`,
    [tournamentId, userId, invitedBy],
  );
  return { participantId: rows[0]!.id, state: 'invited' as const };
}

export async function approveTournamentParticipant(
  pool: Pool,
  tournamentId: string,
  participantId: string,
  approvedBy: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, r.rules_snapshot from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament || tournament.status !== 'registration') {
      throw new AppError('registration_closed', 'registration is closed', 409);
    }
    const participantResult = await client.query<{
      id: string;
      user_id: string;
      state: string;
      entry_fee_coins: number;
    }>(
      `select id, user_id, state, entry_fee_coins from tournament_participant
        where id = $1 and tournament_id = $2 for update`,
      [participantId, tournamentId],
    );
    const participant = participantResult.rows[0];
    if (!participant || !['applied', 'invited'].includes(participant.state)) {
      throw new AppError('conflict', 'participant cannot be approved', 409);
    }
    const count = await client.query<{ count: string }>(
      `select count(*)::text as count from tournament_participant
        where tournament_id = $1 and state = 'approved'`,
      [tournamentId],
    );
    if (Number(count.rows[0]?.count ?? 0) >= tournament.rules_snapshot.config.participantLimit) {
      throw new AppError('capacity_reached', 'capacity reached', 409);
    }
    await client.query(
      `update tournament_participant
          set state = 'approved', approved_by = $2, joined_at = now(), updated_at = now()
        where id = $1`,
      [participant.id, approvedBy],
    );
    await applyEntryFee(client, {
      tournamentId,
      participantId: participant.id,
      userId: participant.user_id,
      amount: Number(participant.entry_fee_coins),
    });
    return { participantId, state: 'approved' as const };
  });
}

export async function cancelTournament(
  pool: Pool,
  tournamentId: string,
  expectedRevision: number,
  cancelledBy: string,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournament = await client.query<{ status: TournamentStatus; current_revision: number }>(
      `select status, current_revision from tournament where id = $1 for update`,
      [tournamentId],
    );
    const row = tournament.rows[0];
    if (!row) throw new AppError('not_found', 'tournament not found', 404);
    if (Number(row.current_revision) !== expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (['completed', 'cancelled', 'archived'].includes(row.status)) {
      throw new AppError('conflict', 'tournament cannot be cancelled', 409);
    }
    const participants = await client.query<{
      id: string;
      user_id: string;
      entry_fee_coins: number;
    }>(
      `select id, user_id, entry_fee_coins from tournament_participant
        where tournament_id = $1 and entry_fee_state = 'paid' for update`,
      [tournamentId],
    );
    for (const participant of participants.rows) {
      await refundEntryFee(client, {
        tournamentId,
        participantId: participant.id,
        userId: participant.user_id,
        amount: Number(participant.entry_fee_coins),
      });
    }
    await client.query(
      `update tournament set status = 'cancelled', cancelled_at = now(),
              updated_by = $2, updated_at = now() where id = $1`,
      [tournamentId, cancelledBy],
    );
    return { tournamentId, status: 'cancelled' as const };
  });
}

export async function archiveTournament(pool: Pool, tournamentId: string, userId: string) {
  const result = await pool.query(
    `update tournament set status = 'archived', archived_at = now(), updated_by = $2, updated_at = now()
      where id = $1 and status in ('completed', 'cancelled')`,
    [tournamentId, userId],
  );
  if (result.rowCount === 0) throw new AppError('conflict', 'tournament cannot be archived', 409);
  return { tournamentId, status: 'archived' as const };
}

export async function generateRegularSchedule(
  pool: Pool,
  tournamentId: string,
  expectedRevision: number,
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      current_revision: number;
      starts_at: Date | null;
      rules_snapshot: TournamentRulesSnapshot;
    }>(
      `select t.status, t.current_revision, t.starts_at, r.rules_snapshot
         from tournament t join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament) throw new AppError('not_found', 'tournament not found', 404);
    if (!['registration', 'registration_blocked', 'scheduling'].includes(tournament.status)) {
      throw new AppError('conflict', 'schedule cannot be regenerated after publication', 409);
    }
    if (Number(tournament.current_revision) !== expectedRevision) {
      throw new AppError('revision_conflict', 'tournament was changed in another tab', 409);
    }
    if (tournament.starts_at === null)
      throw new AppError('conflict', 'start time is required', 409);
    const participants = await client.query<{ id: string }>(
      `select id from tournament_participant
        where tournament_id = $1 and state = 'approved'
        order by seed nulls last, joined_at, id`,
      [tournamentId],
    );
    const config = tournament.rules_snapshot.config;
    if (participants.rows.length < config.playoffSize) {
      await client.query(
        `update tournament set status = 'registration_blocked', updated_at = now() where id = $1`,
        [tournamentId],
      );
      return {
        tournamentId,
        status: 'registration_blocked' as const,
        participantCount: participants.rows.length,
      };
    }
    await client.query(`delete from tournament_matchday where tournament_id = $1`, [tournamentId]);
    let roundCount = 0;
    let fixtureCount = 0;
    if (config.regularSource === 'head_to_head') {
      const plan = buildHeadToHeadSchedulePlan({
        participantIds: participants.rows.map((participant) => participant.id),
        cycles: config.roundRobinCycles,
        roundsPerDay: config.roundsPerDay,
        firstStart: tournament.starts_at,
        fixtureWindowMs: config.fixtureWindowMs,
        roundBreakMs: config.roundBreakMs,
      });
      const grouped = new Map<number, typeof plan>();
      for (const round of plan) {
        const day = grouped.get(round.matchdayNumber) ?? [];
        day.push(round);
        grouped.set(round.matchdayNumber, day);
      }
      const matchdayIds = new Map<number, string>();
      for (const [number, rounds] of grouped) {
        const startsAt = rounds[0]!.startsAt;
        const endsAt = rounds[rounds.length - 1]!.endsAt;
        const inserted = await client.query<{ id: string }>(
          `insert into tournament_matchday
             (tournament_id, number, local_date, starts_at, ends_at)
           values ($1, $2, ($3::timestamptz at time zone $5)::date, $3, $4)
           returning id`,
          [tournamentId, number, startsAt, endsAt, config.timezone],
        );
        matchdayIds.set(number, inserted.rows[0]!.id);
      }
      for (const round of plan) {
        const insertedRound = await client.query<{ id: string }>(
          `insert into tournament_round
             (tournament_id, matchday_id, stage, number, cycle_number, starts_at, ends_at,
              rules_snapshot)
           values ($1, $2, 'regular', $3, $4, $5, $6, $7) returning id`,
          [
            tournamentId,
            matchdayIds.get(round.matchdayNumber),
            round.roundNumber,
            round.cycleNumber,
            round.startsAt,
            round.endsAt,
            JSON.stringify({ byeParticipantId: round.byeParticipantId }),
          ],
        );
        roundCount += 1;
        for (const fixture of round.fixtures) {
          fixtureCount += 1;
          await client.query(
            `insert into tournament_fixture
               (tournament_id, round_id, fixture_number, home_participant_id,
                away_participant_id, scheduled_starts_at, window_ends_at, status)
             values ($1, $2, $3, $4, $5, $6, $7, 'scheduled')`,
            [
              tournamentId,
              insertedRound.rows[0]!.id,
              fixtureCount,
              fixture.homeParticipantId,
              fixture.awayParticipantId,
              round.startsAt,
              round.endsAt,
            ],
          );
        }
      }
    } else {
      for (let day = 1; day <= config.dailyDays; day += 1) {
        const startsAt = new Date(tournament.starts_at.getTime() + (day - 1) * 86_400_000);
        const endsAt = new Date(startsAt.getTime() + 86_400_000);
        await client.query(
          `insert into tournament_matchday
             (tournament_id, number, local_date, starts_at, ends_at)
           values ($1, $2, ($3::timestamptz at time zone $5)::date, $3, $4)`,
          [tournamentId, day, startsAt, endsAt, config.timezone],
        );
      }
    }
    await client.query(
      `update tournament set status = 'scheduling', updated_at = now() where id = $1`,
      [tournamentId],
    );
    return { tournamentId, status: 'scheduling' as const, roundCount, fixtureCount };
  });
}

export async function publishRegularSchedule(pool: Pool, tournamentId: string) {
  const result = await pool.query(
    `update tournament set status = 'regular', updated_at = now()
      where id = $1 and status = 'scheduling'`,
    [tournamentId],
  );
  if (result.rowCount === 0) throw new AppError('conflict', 'schedule is not ready', 409);
  return { tournamentId, status: 'regular' as const };
}

export async function getTournamentSchedule(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query<{
    id: string;
    fixture_number: number;
    stage: string;
    round_number: number;
    scheduled_starts_at: Date | null;
    window_ends_at: Date | null;
    status: string;
    home_user_id: string | null;
    home_name: string | null;
    away_user_id: string | null;
    away_name: string | null;
    home_score: number;
    away_score: number;
  }>(
    `select f.id, f.fixture_number, r.stage, r.number as round_number,
            f.scheduled_starts_at, f.window_ends_at, f.status,
            hp.user_id as home_user_id, hu.display_name as home_name,
            ap.user_id as away_user_id, au.display_name as away_name,
            f.home_score, f.away_score
       from tournament_fixture f
       join tournament_round r on r.id = f.round_id
       left join tournament_participant hp on hp.id = f.home_participant_id
       left join users hu on hu.id = hp.user_id
       left join tournament_participant ap on ap.id = f.away_participant_id
       left join users au on au.id = ap.user_id
      where f.tournament_id = $1
      order by f.fixture_number`,
    [tournamentId],
  );
  return rows.map((row) => ({
    id: row.id,
    fixtureNumber: Number(row.fixture_number),
    stage: row.stage,
    roundNumber: Number(row.round_number),
    scheduledStartsAt: row.scheduled_starts_at?.toISOString() ?? null,
    windowEndsAt: row.window_ends_at?.toISOString() ?? null,
    status: row.status,
    home: row.home_user_id === null ? null : { userId: row.home_user_id, name: row.home_name },
    away: row.away_user_id === null ? null : { userId: row.away_user_id, name: row.away_name },
    score: { home: Number(row.home_score), away: Number(row.away_score) },
  }));
}

export async function getTournamentStandings(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query(
    `select s.rank, p.user_id, u.display_name, s.played, s.wins, s.draws, s.losses,
            s.goals_for, s.goals_against, s.points, s.metrics
       from tournament_standing s
       join tournament_participant p on p.id = s.participant_id
       join users u on u.id = p.user_id
      where s.tournament_id = $1
      order by s.rank nulls last, u.display_name`,
    [tournamentId],
  );
  return rows;
}

function resolveSeedSource(source: PlayoffParticipantSource): string | null {
  return source.type === 'seed' ? source.participantId : null;
}

function defaultHomeSequence(winsRequired: number): HomeDesignation[] {
  const bestOf = winsRequired * 2 - 1;
  const standard: HomeDesignation[] = ['H', 'H', 'A', 'A', 'H', 'A', 'H'];
  return Array.from(
    { length: bestOf },
    (_, index) => standard[index] ?? (index % 2 === 0 ? 'H' : 'A'),
  );
}

const ONE_DAY_MS = 86_400_000;
const MAX_PLAYOFF_ROUND_BREAK_MS = 30 * ONE_DAY_MS;

interface PlayoffRoundRules {
  winsRequired: number;
  homeSequence: HomeDesignation[];
  duelTemplateId: string | null;
  gameWindowMs: number;
  gameBreakMs: number;
  roundBreakMs: number;
  firstGameStartsAt: Date | null;
}

function validIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const offsetHour = parts[7] === undefined ? 0 : Number(parts[7]);
  const offsetMinute = parts[8] === undefined ? 0 : Number(parts[8]);
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  if (
    month! < 1 ||
    month! > 12 ||
    day! < 1 ||
    day! > daysInMonth ||
    hour! > 23 ||
    minute! > 59 ||
    (second !== undefined && second > 59) ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function positiveDuration(value: unknown, fallback: number, maxMs = ONE_DAY_MS): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maxMs
    ? value
    : fallback;
}

function nonNegativeDuration(value: unknown, fallback: number, maxMs = ONE_DAY_MS): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxMs
    ? value
    : fallback;
}

function maxDate(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function playoffRoundRules(rules: TournamentRulesSnapshot, roundNumber: number): PlayoffRoundRules {
  const configured = Array.isArray(rules.playoffRounds)
    ? rules.playoffRounds.find(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          (value as Record<string, unknown>).roundNumber === roundNumber,
      )
    : undefined;
  const record =
    typeof configured === 'object' && configured !== null
      ? (configured as Record<string, unknown>)
      : {};
  const winsRequired =
    typeof record.winsRequired === 'number' && Number.isInteger(record.winsRequired)
      ? Math.max(1, record.winsRequired)
      : 4;
  const homeSequence =
    Array.isArray(record.homeSequence) &&
    record.homeSequence.length === winsRequired * 2 - 1 &&
    record.homeSequence.every((item) => item === 'H' || item === 'A')
      ? (record.homeSequence as HomeDesignation[])
      : defaultHomeSequence(winsRequired);
  const duelTemplateId =
    typeof record.duelTemplateId === 'string'
      ? record.duelTemplateId
      : typeof rules.regularDuelTemplateId === 'string'
        ? rules.regularDuelTemplateId
        : null;
  return {
    winsRequired,
    homeSequence,
    duelTemplateId,
    gameWindowMs: positiveDuration(record.gameWindowMs, ONE_DAY_MS),
    gameBreakMs: nonNegativeDuration(record.gameBreakMs, 0),
    roundBreakMs: nonNegativeDuration(record.roundBreakMs, 0, MAX_PLAYOFF_ROUND_BREAK_MS),
    firstGameStartsAt: validIsoDate(record.firstGameStartsAt),
  };
}

function tieBreakRules(rules: TournamentRulesSnapshot): PlayoffRoundRules {
  const config = rules.config;
  const configured =
    typeof rules.tieBreak === 'object' && rules.tieBreak !== null && !Array.isArray(rules.tieBreak)
      ? (rules.tieBreak as Record<string, unknown>)
      : typeof rules.tiebreak === 'object' &&
          rules.tiebreak !== null &&
          !Array.isArray(rules.tiebreak)
        ? (rules.tiebreak as Record<string, unknown>)
        : {};
  const firstDefined = (...values: unknown[]): unknown =>
    values.find((value) => value !== undefined);
  const duelTemplateId = firstDefined(
    configured.duelTemplateId,
    rules.tieBreakDuelTemplateId,
    rules.tiebreakDuelTemplateId,
    rules.regularDuelTemplateId,
  );
  const regularWindow =
    config.regularSource === 'head_to_head' ? config.fixtureWindowMs : ONE_DAY_MS;
  const regularBreak = config.regularSource === 'head_to_head' ? config.roundBreakMs : 0;
  return {
    winsRequired: 1,
    homeSequence: ['H'],
    duelTemplateId: typeof duelTemplateId === 'string' ? duelTemplateId : null,
    gameWindowMs: positiveDuration(
      firstDefined(configured.gameWindowMs, rules.tieBreakGameWindowMs, rules.tiebreakGameWindowMs),
      regularWindow,
    ),
    gameBreakMs: nonNegativeDuration(
      firstDefined(configured.gameBreakMs, rules.tieBreakGameBreakMs, rules.tiebreakGameBreakMs),
      regularBreak,
    ),
    roundBreakMs: nonNegativeDuration(
      firstDefined(configured.roundBreakMs, rules.tieBreakRoundBreakMs, rules.tiebreakRoundBreakMs),
      0,
      MAX_PLAYOFF_ROUND_BREAK_MS,
    ),
    firstGameStartsAt: validIsoDate(
      firstDefined(
        configured.firstGameStartsAt,
        rules.tieBreakFirstGameStartsAt,
        rules.tiebreakFirstGameStartsAt,
      ),
    ),
  };
}

async function playoffBaseTime(
  client: PoolClient,
  tournamentId: string,
  now: Date,
  tournamentStartsAt: Date | null,
): Promise<Date> {
  const existing = await client.query<{ latest_end: Date | null }>(
    `select max(f.window_ends_at) as latest_end
       from tournament_fixture f
       join tournament_round r on r.id = f.round_id
      where f.tournament_id = $1
        and r.stage in ('regular', 'tiebreak')
        and f.window_ends_at is not null`,
    [tournamentId],
  );
  const tieBreak = await client.query<{
    ends_at: Date | null;
    latest_fixture_end: Date | null;
    rules_snapshot: Record<string, unknown>;
  }>(
    `select r.ends_at, r.rules_snapshot, max(f.window_ends_at) as latest_fixture_end
       from tournament_round r
       left join tournament_fixture f on f.round_id = r.id and f.window_ends_at is not null
      where r.tournament_id = $1 and r.stage = 'tiebreak'
      group by r.id
      order by r.ends_at desc nulls last limit 1`,
    [tournamentId],
  );
  const candidates = [now];
  if (tournamentStartsAt !== null) candidates.push(tournamentStartsAt);
  if (existing.rows[0]?.latest_end !== null && existing.rows[0]?.latest_end !== undefined) {
    candidates.push(existing.rows[0].latest_end);
  }
  const completedTieBreak = tieBreak.rows[0];
  const actualTieBreakEnd =
    completedTieBreak?.latest_fixture_end ?? completedTieBreak?.ends_at ?? null;
  if (completedTieBreak && actualTieBreakEnd !== null) {
    const roundBreakMs = nonNegativeDuration(
      completedTieBreak.rules_snapshot.roundBreakMs,
      0,
      MAX_PLAYOFF_ROUND_BREAK_MS,
    );
    candidates.push(new Date(actualTieBreakEnd.getTime() + roundBreakMs));
  }
  return maxDate(...candidates);
}

export async function startTournamentPlayoffs(pool: Pool, tournamentId: string, now = new Date()) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, tournamentId);
    const tournamentResult = await client.query<{
      status: TournamentStatus;
      rules_snapshot: TournamentRulesSnapshot;
      starts_at: Date | null;
    }>(
      `select t.status, t.starts_at, r.rules_snapshot from tournament t
         join tournament_revision r on r.id = t.published_revision_id
        where t.id = $1 for update of t`,
      [tournamentId],
    );
    const tournament = tournamentResult.rows[0];
    if (!tournament || tournament.status !== 'regular') {
      throw new AppError('conflict', 'regular season is not active', 409);
    }
    const rebuilt =
      tournament.rules_snapshot.config.regularSource === 'head_to_head'
        ? await rebuildHeadToHeadStandings(client, tournamentId)
        : { boundaryTieParticipantIds: [] };
    const baseTime = await playoffBaseTime(client, tournamentId, now, tournament.starts_at);
    if (rebuilt.boundaryTieParticipantIds.length > 0) {
      const existing = await client.query<{ id: string }>(
        `select id from tournament_round where tournament_id = $1 and stage = 'tiebreak' limit 1`,
        [tournamentId],
      );
      if (!existing.rows[0]) {
        const rules = tieBreakRules(tournament.rules_snapshot);
        if (rules.duelTemplateId === null) {
          throw new AppError(
            'configuration_error',
            'tie-break duel template is not configured',
            409,
          );
        }
        const firstStart = maxDate(baseTime, rules.firstGameStartsAt ?? baseTime);
        const gameCount =
          (rebuilt.boundaryTieParticipantIds.length *
            (rebuilt.boundaryTieParticipantIds.length - 1)) /
          2;
        const windows = buildPlayoffFixtureWindows({
          gameCount,
          firstStart,
          gameWindowMs: rules.gameWindowMs,
          gameBreakMs: rules.gameBreakMs,
        });
        const round = await client.query<{ id: string }>(
          `insert into tournament_round
             (tournament_id, stage, number, name, starts_at, ends_at, status, rules_snapshot)
           values ($1, 'tiebreak', 1, 'Тай-брейк за выход в плей-офф', $2, $3, 'scheduled', $4)
           returning id`,
          [
            tournamentId,
            firstStart,
            new Date(windows[windows.length - 1]!.endsAt),
            JSON.stringify({
              reason: 'playoff_boundary_tie',
              duelTemplateId: rules.duelTemplateId,
              gameWindowMs: rules.gameWindowMs,
              gameBreakMs: rules.gameBreakMs,
              roundBreakMs: rules.roundBreakMs,
              firstGameStartsAt: firstStart.toISOString(),
            }),
          ],
        );
        let number = 1;
        for (let left = 0; left < rebuilt.boundaryTieParticipantIds.length; left += 1) {
          for (let right = left + 1; right < rebuilt.boundaryTieParticipantIds.length; right += 1) {
            const window = windows[number - 1]!;
            await client.query(
              `insert into tournament_fixture
                 (tournament_id, round_id, fixture_number, home_participant_id,
                  away_participant_id, scheduled_starts_at, window_ends_at, status, result_snapshot)
               values ($1, $2, 100000 + $3, $4, $5, $6, $7, 'scheduled', $8)`,
              [
                tournamentId,
                round.rows[0]!.id,
                number,
                rebuilt.boundaryTieParticipantIds[left],
                rebuilt.boundaryTieParticipantIds[right],
                window.startsAt,
                window.endsAt,
                JSON.stringify({ gameNumber: number, duelTemplateId: rules.duelTemplateId }),
              ],
            );
            number += 1;
          }
        }
      }
      return {
        tournamentId,
        status: 'tiebreak_required' as const,
        participantIds: rebuilt.boundaryTieParticipantIds,
      };
    }
    const size = tournament.rules_snapshot.config.playoffSize;
    const standings = await client.query<{ participant_id: string }>(
      `select participant_id from tournament_standing
        where tournament_id = $1 and rank <= $2 order by rank`,
      [tournamentId, size],
    );
    if (standings.rows.length !== size) {
      throw new AppError('conflict', 'playoff participants are not resolved', 409);
    }
    const plan = buildPlayoffSeriesPlan(standings.rows.map((row) => row.participant_id));
    const schedules = new Map<
      number,
      {
        rules: PlayoffRoundRules;
        startsAt: Date;
        endsAt: Date;
        windows: ReturnType<typeof buildPlayoffFixtureWindows>;
      }
    >();
    let previousRoundEnd = baseTime;
    let previousRoundBreakMs = 0;
    const roundNumbers = [
      ...new Set(
        plan.filter((item) => item.kind === 'championship').map((item) => item.roundNumber),
      ),
    ].sort((left, right) => left - right);
    for (const roundNumber of roundNumbers) {
      const rules = playoffRoundRules(tournament.rules_snapshot, roundNumber);
      const firstStart = maxDate(
        new Date(previousRoundEnd.getTime() + previousRoundBreakMs),
        rules.firstGameStartsAt ?? previousRoundEnd,
      );
      const windows = buildPlayoffFixtureWindows({
        gameCount: rules.winsRequired * 2 - 1,
        firstStart,
        gameWindowMs: rules.gameWindowMs,
        gameBreakMs: rules.gameBreakMs,
      });
      const endsAt = new Date(windows[windows.length - 1]!.endsAt);
      schedules.set(roundNumber, { rules, startsAt: firstStart, endsAt, windows });
      previousRoundEnd = endsAt;
      previousRoundBreakMs = rules.roundBreakMs;
    }
    const roundIds = new Map<string, string>();
    for (const item of plan) {
      const stage = item.kind === 'third_place' ? 'third_place' : 'playoff';
      const key = `${stage}:${item.roundNumber}`;
      if (roundIds.has(key)) continue;
      const schedule = schedules.get(item.roundNumber)!;
      const round = await client.query<{ id: string }>(
        `insert into tournament_round
           (tournament_id, stage, number, name, starts_at, ends_at, status, rules_snapshot)
         values ($1, $2, $3, $4, $5, $6, 'scheduled', $7) returning id`,
        [
          tournamentId,
          stage,
          item.roundNumber,
          stage === 'third_place' ? 'Серия за третье место' : `Раунд плей-офф ${item.roundNumber}`,
          schedule.startsAt,
          schedule.endsAt,
          JSON.stringify({
            ...schedule.rules,
            firstGameStartsAt: schedule.rules.firstGameStartsAt?.toISOString() ?? null,
          }),
        ],
      );
      roundIds.set(key, round.rows[0]!.id);
    }
    const seriesIds = new Map<string, string>();
    const fixtureNumberResult = await client.query<{ next: number }>(
      `select coalesce(max(fixture_number), 0)::int + 1 as next
         from tournament_fixture where tournament_id = $1`,
      [tournamentId],
    );
    let fixtureNumber = Number(fixtureNumberResult.rows[0]?.next ?? 1);
    for (const item of plan) {
      const scheduleWindows = schedules.get(item.roundNumber)!;
      const rules = scheduleWindows.rules;
      if (rules.duelTemplateId === null) {
        throw new AppError('configuration_error', 'playoff duel template is not configured', 409);
      }
      const stage = item.kind === 'third_place' ? 'third_place' : 'playoff';
      const higherParticipantId = resolveSeedSource(item.higherSource);
      const lowerParticipantId = resolveSeedSource(item.lowerSource);
      const series = await client.query<{ id: string }>(
        `insert into tournament_playoff_series
           (tournament_id, round_id, bracket_position, kind,
            higher_seed_participant_id, lower_seed_participant_id, wins_required,
            home_sequence, status, depends_on)
         values ($1, $2, $3, $4, $5, $6, $7, $8,
                 case when $5::uuid is null then 'pending' else 'scheduled' end, $9)
         returning id`,
        [
          tournamentId,
          roundIds.get(`${stage}:${item.roundNumber}`),
          item.position,
          item.kind,
          higherParticipantId,
          lowerParticipantId,
          rules.winsRequired,
          JSON.stringify(rules.homeSequence),
          JSON.stringify({ key: item.key, sources: [item.higherSource, item.lowerSource] }),
        ],
      );
      seriesIds.set(item.key, series.rows[0]!.id);
      const schedule = expandSeriesSchedule(rules.winsRequired, rules.homeSequence);
      for (const game of schedule) {
        const higherIsHome = game.higherSeedIsHome;
        const window = scheduleWindows.windows[game.gameNumber - 1]!;
        await client.query(
          `insert into tournament_fixture
             (tournament_id, round_id, series_id, fixture_number,
              home_participant_id, away_participant_id, scheduled_starts_at,
              window_ends_at, status, result_snapshot)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            tournamentId,
            roundIds.get(`${stage}:${item.roundNumber}`),
            series.rows[0]!.id,
            fixtureNumber,
            higherIsHome ? higherParticipantId : lowerParticipantId,
            higherIsHome ? lowerParticipantId : higherParticipantId,
            window.startsAt,
            window.endsAt,
            higherParticipantId === null || lowerParticipantId === null || game.conditional
              ? 'conditional'
              : 'scheduled',
            JSON.stringify({
              gameNumber: game.gameNumber,
              higherSeedIsHome: game.higherSeedIsHome,
              duelTemplateId: rules.duelTemplateId,
            }),
          ],
        );
        fixtureNumber += 1;
      }
    }
    await client.query(
      `update tournament set status = 'playoff', updated_at = now() where id = $1`,
      [tournamentId],
    );
    return { tournamentId, status: 'playoff' as const, seriesCount: seriesIds.size };
  });
}

export async function getTournamentBracket(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query(
    `select s.id, s.bracket_position, s.kind, s.wins_required, s.higher_seed_wins,
            s.lower_seed_wins, s.status, s.home_sequence, s.depends_on,
            hp.user_id as higher_user_id, hu.display_name as higher_name,
            lp.user_id as lower_user_id, lu.display_name as lower_name,
            wp.user_id as winner_user_id
       from tournament_playoff_series s
       left join tournament_participant hp on hp.id = s.higher_seed_participant_id
       left join users hu on hu.id = hp.user_id
       left join tournament_participant lp on lp.id = s.lower_seed_participant_id
       left join users lu on lu.id = lp.user_id
       left join tournament_participant wp on wp.id = s.winner_participant_id
      where s.tournament_id = $1
      order by s.kind, s.round_id, s.bracket_position`,
    [tournamentId],
  );
  return rows;
}

export async function duplicateTournamentDraft(
  pool: Pool,
  input: { tournamentId: string; slug: string; title: string; createdBy: string },
) {
  const source = await getTournament(pool, input.tournamentId);
  return createTournamentDraft(pool, {
    slug: input.slug,
    title: input.title,
    description: source.description,
    rules: source.rules,
    createdBy: input.createdBy,
    registrationOpensAt: null,
    registrationClosesAt: null,
    startsAt: null,
  });
}

export async function listTournamentParticipants(pool: Pool, tournamentId: string) {
  const { rows } = await pool.query(
    `select p.id, p.user_id, u.display_name, u.avatar_url, p.state, p.seed,
            p.entry_fee_coins, p.entry_fee_state, p.joined_at, p.withdrawn_at,
            p.created_at, p.updated_at
       from tournament_participant p join users u on u.id = p.user_id
      where p.tournament_id = $1 order by p.created_at, p.id`,
    [tournamentId],
  );
  return rows;
}

export async function rescheduleTournamentFixture(
  pool: Pool,
  input: {
    tournamentId: string;
    fixtureId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    adminUserId: string;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournamentFixture(client, input);
    const updated = await client.query(
      `update tournament_fixture
          set scheduled_starts_at = $3, window_ends_at = $4,
              rescheduled_reason = $5, updated_at = now()
        where id = $1 and tournament_id = $2
          and status in ('conditional', 'scheduled', 'open', 'paused')
        returning id, scheduled_starts_at, window_ends_at`,
      [input.fixtureId, input.tournamentId, input.startsAt, input.endsAt, input.reason],
    );
    if (updated.rowCount === 0)
      throw new AppError('conflict', 'fixture cannot be rescheduled', 409);
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, fixture_id, kind, payload, reason, created_by)
       values ($1, $2, 'schedule', $3, $4, $5)`,
      [
        input.tournamentId,
        input.fixtureId,
        JSON.stringify({ startsAt: input.startsAt, endsAt: input.endsAt }),
        input.reason,
        input.adminUserId,
      ],
    );
    await enqueueTournamentSeriesNextGamePush(client, { fixtureId: input.fixtureId });
    return {
      fixtureId: input.fixtureId,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
    };
  });
}

export async function resolveTournamentNoShow(
  pool: Pool,
  input: {
    tournamentId: string;
    fixtureId: string;
    absent: 'home' | 'away' | 'both';
    reason: string;
    adminUserId: string;
  },
) {
  return inTransaction(pool, async (client) => {
    await lockTournamentFixture(client, input);
    const fixtureResult = await client.query<{
      home_participant_id: string | null;
      away_participant_id: string | null;
      series_id: string | null;
      stage: string;
    }>(
      `select f.home_participant_id, f.away_participant_id, f.series_id, r.stage
         from tournament_fixture f join tournament_round r on r.id = f.round_id
        where f.id = $1 and f.tournament_id = $2 for update of f`,
      [input.fixtureId, input.tournamentId],
    );
    const fixture = fixtureResult.rows[0];
    if (!fixture || fixture.home_participant_id === null || fixture.away_participant_id === null) {
      throw new AppError('not_found', 'fixture not found', 404);
    }
    let fixtureChanged = false;
    if (input.absent === 'both' && fixture.stage !== 'regular') {
      const paused = await client.query(
        `update tournament_fixture
            set status = 'paused', updated_at = now()
          where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')
          returning id`,
        [input.fixtureId],
      );
      fixtureChanged = (paused.rowCount ?? 0) > 0;
      if (fixtureChanged && fixture.series_id) {
        await client.query(
          `update tournament_playoff_series
              set status = 'paused', updated_at = now()
            where id = $1 and status in ('pending', 'scheduled', 'active')`,
          [fixture.series_id],
        );
      }
      if (fixtureChanged) {
        await client.query(
          `update tournament set status = 'paused', updated_at = now()
            where id = $1 and status <> 'paused'`,
          [input.tournamentId],
        );
      }
    } else {
      const winner =
        input.absent === 'home'
          ? fixture.away_participant_id
          : input.absent === 'away'
            ? fixture.home_participant_id
            : null;
      const outcome =
        input.absent === 'home'
          ? 'away_win'
          : input.absent === 'away'
            ? 'home_win'
            : 'double_forfeit';
      const updated = await client.query(
        `update tournament_fixture
            set status = 'forfeit', winner_participant_id = $2, outcome = $3,
                home_score = case when $3 = 'home_win' then 1 else 0 end,
                away_score = case when $3 = 'away_win' then 1 else 0 end,
                result_snapshot = $4, settled_at = now(), updated_at = now()
          where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')
          returning id`,
        [
          input.fixtureId,
          winner,
          outcome,
          JSON.stringify({ technical: true, absent: input.absent }),
        ],
      );
      if ((updated.rowCount ?? 0) > 0) {
        fixtureChanged = true;
        if (fixture.series_id !== null && winner !== null) {
          await advanceTournamentPlayoffSeries(client, {
            seriesId: fixture.series_id,
            winnerParticipantId: winner,
          });
        }
        if (fixture.stage === 'regular') await rebuildHeadToHeadStandings(client, input.tournamentId);
        await enqueueTournamentFixtureResultPush(client, {
          fixtureId: input.fixtureId,
          homeParticipantId: fixture.home_participant_id,
          awayParticipantId: fixture.away_participant_id,
          winnerParticipantId: winner,
        });
      }
    }
    if (fixtureChanged) {
      await client.query(
        `insert into tournament_adjustment
           (tournament_id, fixture_id, kind, payload, reason, created_by)
         values ($1, $2, 'forfeit', $3, $4, $5)`,
        [
          input.tournamentId,
          input.fixtureId,
          JSON.stringify({ absent: input.absent }),
          input.reason,
          input.adminUserId,
        ],
      );
    }
    return { fixtureId: input.fixtureId, resolution: input.absent };
  });
}

export async function disqualifyTournamentParticipant(
  pool: Pool,
  input: { tournamentId: string; participantId: string; reason: string; adminUserId: string },
) {
  return inTransaction(pool, async (client) => {
    await lockTournament(client, input.tournamentId);
    const participant = await client.query(
      `update tournament_participant set state = 'disqualified', withdrawn_at = now(), updated_at = now()
        where id = $1 and tournament_id = $2 and state = 'approved' returning id`,
      [input.participantId, input.tournamentId],
    );
    if (participant.rowCount === 0)
      throw new AppError('conflict', 'participant cannot be disqualified', 409);
    let futureForfeits = 0;
    let regularFixtureChanged = false;
    for (;;) {
      const fixtureResult = await client.query<{
        id: string;
        series_id: string | null;
        stage: string;
        home_participant_id: string;
        away_participant_id: string;
        side: 'home' | 'away';
        winner_participant_id: string;
      }>(
        `select f.id, f.series_id, r.stage, f.home_participant_id, f.away_participant_id,
                case when f.home_participant_id = $2 then 'home' else 'away' end as side,
                case when f.home_participant_id = $2
                     then f.away_participant_id else f.home_participant_id end
                  as winner_participant_id
           from tournament_fixture f
           join tournament_round r on r.id = f.round_id
          where f.tournament_id = $1
            and f.status in ('conditional', 'scheduled', 'open', 'active')
            and (f.home_participant_id = $2 or f.away_participant_id = $2)
            and f.home_participant_id is not null and f.away_participant_id is not null
          order by f.fixture_number
          limit 1
          for update of f`,
        [input.tournamentId, input.participantId],
      );
      const fixture = fixtureResult.rows[0];
      if (!fixture) break;
      const updated = await client.query(
        `update tournament_fixture
            set status = 'forfeit',
                winner_participant_id = case when $2 = 'home' then away_participant_id else home_participant_id end,
                outcome = case when $2 = 'home' then 'away_win' else 'home_win' end,
                home_score = case when $2 = 'away' then 1 else 0 end,
                away_score = case when $2 = 'home' then 1 else 0 end,
                result_snapshot = $3, settled_at = now(), updated_at = now()
          where id = $1 and status in ('conditional', 'scheduled', 'open', 'active')
          returning id`,
        [fixture.id, fixture.side, JSON.stringify({ technical: true, disqualification: true })],
      );
      if (updated.rowCount === 0) continue;
      futureForfeits += 1;
      if (fixture.series_id !== null) {
        await advanceTournamentPlayoffSeries(client, {
          seriesId: fixture.series_id,
          winnerParticipantId: fixture.winner_participant_id,
        });
      }
      if (fixture.stage === 'regular') regularFixtureChanged = true;
      await enqueueTournamentFixtureResultPush(client, {
        fixtureId: fixture.id,
        homeParticipantId: fixture.home_participant_id,
        awayParticipantId: fixture.away_participant_id,
        winnerParticipantId: fixture.winner_participant_id,
      });
    }
    await client.query(
      `insert into tournament_adjustment
         (tournament_id, participant_id, kind, payload, reason, created_by)
       values ($1, $2, 'disqualification', $3, $4, $5)`,
      [
        input.tournamentId,
        input.participantId,
        JSON.stringify({ futureFixtures: futureForfeits }),
        input.reason,
        input.adminUserId,
      ],
    );
    if (regularFixtureChanged) await rebuildHeadToHeadStandings(client, input.tournamentId);
    return { participantId: input.participantId, futureForfeits };
  });
}
