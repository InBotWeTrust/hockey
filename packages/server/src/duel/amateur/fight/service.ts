import type { PoolClient } from 'pg';
import {
  DEFAULT_FIGHT_RULES,
  createFightState,
  FIGHT_FINISH_ANIMATION_MS,
  FIGHT_RESULT_DISPLAY_MS,
  FIGHT_MEDICAL_AID_MS,
  advanceFight,
  type FightState,
  type FightCommand,
  type FightRules,
} from '@hockey/game-core';
import { AppError } from '../../../plugins/errors.js';
import type { FightDuelContext } from './routes.js';
import { fightWindowRemainingMs, FIGHT_RESPONSE_TIMEOUT_MS, FIGHT_MAX_CALLS, FIGHT_MAX_REFUSALS } from './window.js';

export const FIGHT_RESULT_HOLD_MS = FIGHT_FINISH_ANIMATION_MS + FIGHT_RESULT_DISPLAY_MS;

export interface PersistedFight {
  id: string;
  match_id: string;
  initiator_user_id: string;
  request_id: string;
  response_decision: 'accept' | 'decline' | null;
  status: string;
  forced: boolean;
  reason: string | null;
  offered_at: Date;
  response_deadline_at: Date;
  starts_at: Date | null;
  rules: FightRules;
  compensation_ms: [number, number];
  engine_state: FightState | null;
  winner_user_id: string | null;
  resolved_at: Date | null;
}
export function denyFight(reason: string): never {
  throw new AppError('conflict', 'Fight action is unavailable', 409, { reason });
}
export async function getFight(
  client: PoolClient,
  matchId: string,
): Promise<PersistedFight | null> {
  return (
    (
      await client.query<PersistedFight>('select * from amateur_duel_fight where match_id=$1 order by offered_at desc,id desc limit 1', [
        matchId,
      ])
    ).rows[0] ?? null
  );
}
export async function getFightHistory(client: PoolClient, matchId: string): Promise<PersistedFight[]> {
  return (await client.query<PersistedFight>(
    'select * from amateur_duel_fight where match_id=$1 order by offered_at desc,id desc', [matchId],
  )).rows;
}
export function remainingFightCalls(history: PersistedFight[], userId: string): number {
  return Math.max(0, FIGHT_MAX_CALLS - history.filter(f => f.initiator_user_id === userId).length);
}
function mustAcceptFight(history: PersistedFight[], userId: string): boolean {
  return history.filter(f => f.initiator_user_id !== userId && f.status === 'declined' &&
    (f.reason === 'decline' || f.reason === 'timeout')).length >= FIGHT_MAX_REFUSALS;
}

export async function queueFightSnapshot(client: PoolClient, matchId: string): Promise<void> {
  const result = await client.query<{ state_revision: string }>(
    'update amateur_duel_match set state_revision=state_revision+1,updated_at=now() where id=$1 returning state_revision',
    [matchId],
  );
  await client.query(
    'insert into amateur_duel_fight_outbox(match_id,revision) values($1,$2) on conflict do nothing',
    [matchId, result.rows[0]!.state_revision],
  );
}
export async function resumeDuel(
  client: PoolClient,
  ctx: FightDuelContext,
  nowMs: number,
  penalizedUser: string | null,
  recoveryMs: number,
): Promise<void> {
  const at = new Date(nowMs);
  await client.query(
    `update amateur_duel_participant set period_paused_ms=period_paused_ms+greatest(0,floor(extract(epoch from ($2::timestamptz-period_paused_at))*1000)::integer),
    period_paused_at=null
    where match_id=$1 and period_paused_at is not null`,
    [ctx.id, at],
  );
  await client.query(
    `update amateur_duel_match set ends_at=ends_at+greatest(interval '0', $2::timestamptz-fight_paused_at),fight_paused_at=null where id=$1 and fight_paused_at is not null`,
    [ctx.id, at],
  );
  if (penalizedUser !== null && recoveryMs > 0) {
    const participant = ctx.participants.find(p => p.userId === penalizedUser);
    const remainingRecoveryMs = participant?.state === 'period_active'
      ? Math.max(0, Math.min(recoveryMs, participant.remainingMs))
      : 0;
    await client.query(
      `update amateur_duel_participant set recovery_until=case when $4::integer > 0 then $3::timestamptz+($4::integer*interval '1 millisecond') else null end where match_id=$1 and user_id=$2`,
      [ctx.id, penalizedUser, at, remainingRecoveryMs],
    );
  }
  await queueFightSnapshot(client, ctx.id);
}
// Resume at the persisted deadline, including after a worker delay or reconnect.
export async function advanceMedicalAid(
  client: PoolClient, matchId: string, nowMs: number, interrupted = false,
): Promise<boolean> {
  const result = await client.query(
    `update amateur_duel_participant set
       period_paused_ms=period_paused_ms+greatest(0,floor(extract(epoch from
         ((case when $3 then least(fight_aid_until,$2::timestamptz) else fight_aid_until end)-period_paused_at))*1000)::integer),
       period_paused_at=null,fight_aid_until=null,recovery_until=null
     where match_id=$1 and fight_aid_until is not null and (fight_aid_until<=$2 or $3)
     returning user_id`,
    [matchId,new Date(nowMs),interrupted],
  );
  const changed = (result.rowCount ?? 0) > 0;
  if (changed) await queueFightSnapshot(client,matchId);
  return changed;
}

async function beginMedicalAid(client: PoolClient, ctx: FightDuelContext, fight: PersistedFight): Promise<void> {
  const resultEndsAt = fight.resolved_at!.getTime()+FIGHT_RESULT_HOLD_MS;
  const aidUntil = new Date(resultEndsAt+FIGHT_MEDICAL_AID_MS);
  // The common pause ends for the winner. Only the loser remains paused for assistance.
  await client.query(
    `update amateur_duel_participant set
       period_paused_ms=period_paused_ms+case when user_id=$2 then
         greatest(0,floor(extract(epoch from ($3::timestamptz-period_paused_at))*1000)::integer) else 0 end,
       period_paused_at=case when user_id=$2 then null else period_paused_at end,
       fight_aid_until=case when user_id<>$2 and state='period_active' then $4::timestamptz else null end,
       recovery_until=null
     where match_id=$1 and period_paused_at is not null`,
    [ctx.id,fight.winner_user_id,new Date(resultEndsAt),aidUntil],
  );
  await client.query(
    `update amateur_duel_match set
       ends_at=ends_at+greatest(interval '0',$2::timestamptz-fight_paused_at)+($3::integer*interval '1 millisecond'),
       fight_paused_at=null where id=$1 and fight_paused_at is not null`,
    [ctx.id,new Date(resultEndsAt),FIGHT_MEDICAL_AID_MS],
  );
  await advanceMedicalAid(client,ctx.id,ctx.nowMs);
  await queueFightSnapshot(client,ctx.id);
}

export async function createChallenge(
  client: PoolClient,
  ctx: FightDuelContext,
  userId: string,
  requestId: string,
): Promise<PersistedFight> {
  const history = await getFightHistory(client, ctx.id);
  const replay = history.find(f => f.initiator_user_id === userId && f.request_id === requestId);
  if (replay) return replay;
  const existing = history[0];
  // Opposite simultaneous calls converge on the same outstanding offer.
  if (existing?.status === 'offered') return existing;
  if (remainingFightCalls(history, userId) === 0) denyFight('attempt_used');
  if (ctx.paused || (existing && ['starting','fighting','sudden_death'].includes(existing.status)))
    denyFight('unavailable');
  if (!['challenge', 'matchmaking'].includes(ctx.source)) denyFight('unsupported_mode');
  if (ctx.status !== 'active' || ctx.paused) denyFight('unavailable');
  const opponent = ctx.participants.find((p) => p.userId !== userId);
  const me = ctx.participants.find((p) => p.userId === userId);
  if (!opponent || opponent.state !== 'period_active' || fightWindowRemainingMs(opponent) <= 0) denyFight('opponent_unavailable');
  if (!me || me.state !== 'period_active' || fightWindowRemainingMs(me) <= 0) denyFight('unavailable');
  const enabled = await client.query<{ enabled: boolean }>(
    "select value='true'::jsonb as enabled from game_settings where key='duels.fights.enabled'",
  );
  if (enabled.rows[0]?.enabled !== true) denyFight('disabled');
  if (!ctx.canExtend) denyFight('system_limit');
  const presence = await client.query<{ user_id: string; compensation_ms: number }>(
    'select user_id,compensation_ms from amateur_duel_fight_presence where match_id=$1 and expires_at>$2',
    [ctx.id, new Date(ctx.nowMs)],
  );
  if (ctx.participants.some((p) => !presence.rows.some((r) => r.user_id === p.userId)))
    denyFight('protocol_unavailable');
  const result = await client.query<PersistedFight>(
    `insert into amateur_duel_fight(match_id,initiator_user_id,request_id,status,offered_at,response_deadline_at,rules,compensation_ms,forced)
    values($1,$2,$3,'offered',$4,$5,$6,$7,$8) returning *`,
    [
      ctx.id,
      userId,
      requestId,
      new Date(ctx.nowMs),
      new Date(ctx.nowMs + FIGHT_RESPONSE_TIMEOUT_MS),
      JSON.stringify(DEFAULT_FIGHT_RULES),
      JSON.stringify(
        ctx.participants.map(
          (p) => presence.rows.find((r) => r.user_id === p.userId)!.compensation_ms,
        ),
      ),
      mustAcceptFight(history, opponent.userId),
    ],
  );
  await queueFightSnapshot(client, ctx.id);
  return result.rows[0]!;
}
export async function respondChallenge(
  client: PoolClient,
  ctx: FightDuelContext,
  userId: string,
  fightId: string,
  decision: 'accept' | 'decline',
  requestId: string,
): Promise<PersistedFight> {
  const fight = await getFight(client, ctx.id);
  if (!fight || fight.id !== fightId) denyFight('unknown_fight');
  if (fight.initiator_user_id === userId) denyFight('initiator_cannot_respond');
  if (fight.status !== 'offered') {
    if (fight.response_decision === decision) return fight;
    denyFight('already_decided');
  }
  if (ctx.status !== 'active' || ctx.mandatoryBlocked) denyFight('system_interruption');
  if (ctx.nowMs >= fight.response_deadline_at.getTime()) denyFight('response_expired');
  if (decision === 'decline') {
    if (fight.forced) denyFight('forced_fight');
    await client.query(
      "update amateur_duel_fight set status='declined',resolved_at=$2,reason='decline',response_decision='decline',response_request_id=$3,revision=revision+1 where id=$1",
      [fight.id, new Date(ctx.nowMs), requestId],
    );
    await resumeDuel(client, ctx, ctx.nowMs, userId, 2000);
  } else {
    await startChallenge(client, ctx, fight, requestId);
  }
  return (await getFight(client, ctx.id))!;
}

async function startChallenge(
  client: PoolClient, ctx: FightDuelContext, fight: PersistedFight, requestId: string | null,
): Promise<void> {
  if (ctx.participants.some(p => p.state !== 'period_active' || fightWindowRemainingMs(p) <= 0))
    denyFight('opponent_unavailable');
  if (!ctx.canExtend) denyFight('system_limit');
  await client.query('update amateur_duel_match set fight_paused_at=$2 where id=$1', [ctx.id, new Date(ctx.nowMs)]);
  await client.query('update amateur_duel_participant set period_paused_at=$2 where match_id=$1', [ctx.id, new Date(ctx.nowMs)]);
  const start = ctx.nowMs + 1000;
  await client.query(
    "update amateur_duel_fight set status='starting',starts_at=$2,engine_state=$3,response_decision='accept',response_request_id=$4,revision=revision+1 where id=$1",
    [fight.id, new Date(start), JSON.stringify(createFightState(fight.rules, start)), requestId],
  );
  await queueFightSnapshot(client, ctx.id);
}

export async function advancePersistedFight(
  client: PoolClient,
  ctx: FightDuelContext,
): Promise<PersistedFight | null> {
  await advanceMedicalAid(client,ctx.id,ctx.nowMs,ctx.status !== 'active' || ctx.mandatoryBlocked === true);
  let fight = await getFight(client, ctx.id);
  if (!fight) return null;
  if (fight.status === 'resolved') {
    if (ctx.paused && fight.resolved_at &&
        (ctx.nowMs >= fight.resolved_at.getTime() + FIGHT_RESULT_HOLD_MS || ctx.status !== 'active' || ctx.mandatoryBlocked)) {
      if (ctx.status === 'active' && !ctx.mandatoryBlocked && fight.winner_user_id !== null) {
        await beginMedicalAid(client,ctx,fight);
      } else {
        await resumeDuel(client,ctx,ctx.nowMs,null,0);
      }
    }
    return fight;
  }
  if (['declined', 'cancelled'].includes(fight.status)) return fight;
  if (ctx.status !== 'active' || ctx.mandatoryBlocked ||
      (fight.status === 'offered' && (ctx.participants.some(p => p.state !== 'period_active' || fightWindowRemainingMs(p) <= 0) || !ctx.canExtend))) {
    await client.query(
      "update amateur_duel_fight set status='cancelled',reason='system_interruption',resolved_at=$2,revision=revision+1 where id=$1",
      [fight.id, new Date(ctx.nowMs)],
    );
    await resumeDuel(client, ctx, ctx.nowMs, null, 0);
    return getFight(client, ctx.id);
  }
  if (fight.status === 'offered') {
    if (ctx.nowMs >= fight.response_deadline_at.getTime()) {
      if (fight.forced) {
        await startChallenge(client, ctx, fight, null);
        return getFight(client, ctx.id);
      }
      const target = ctx.participants.find((p) => p.userId !== fight!.initiator_user_id)!;
      await client.query(
        "update amateur_duel_fight set status='declined',reason='timeout',response_decision='decline',resolved_at=$2,revision=revision+1 where id=$1",
        [fight.id, new Date(ctx.nowMs)],
      );
      await resumeDuel(client, ctx, ctx.nowMs, target.userId, 2000);
    }
    return getFight(client, ctx.id);
  }
  if (!fight.engine_state || !fight.starts_at || ctx.nowMs < fight.starts_at.getTime())
    return fight;
  const commands = (
    await client.query<{ payload: FightCommand }>(
      'select payload from amateur_duel_fight_command where fight_id=$1 order by received_at,user_id,seq',
      [fight.id],
    )
  ).rows.map((r) => r.payload);
  const before = fight.engine_state;
  const through = ctx.nowMs - fight.rules.deliveryGraceMs;
  const hasWork =
    fight.status === 'starting' ||
    through >= before.deadlineMs ||
    commands.some((c) => c.phaseId === before.phaseId && c.seq > before.lastSeq[c.player]) ||
    before.actions.some(
      (a) =>
        a.kind === 'attack' &&
        !a.resolved &&
        Math.min(a.activeUntilMs, before.deadlineMs) <= through,
    );
  if (!hasWork) return fight;
  let next = advanceFight(before, commands, through).state;
  if (before.status === 'fighting' && next.status === 'sudden_death') {
    if (
      through >=
      before.deadlineMs + fight.rules.deliveryGraceMs + fight.rules.suddenDeathDurationMs
    ) {
      // Replay a completed downtime timeline without granting a new full phase.
      next = advanceFight(next, [], Math.max(through, next.deadlineMs)).state;
    } else {
      // A live phase starts when the server confirms it, including worker delay.
      next.phaseStartedAtMs = ctx.nowMs;
      next.deadlineMs = ctx.nowMs + fight.rules.suddenDeathDurationMs;
      next.finalizedThroughMs = ctx.nowMs - 1;
    }
  }
  const terminal = next.status === 'resolved' || next.status === 'cancelled';
  const winner = next.winner === null ? null : ctx.participants[next.winner]!.userId;
  // Main-phase admission and result writes are under the same match/gameplay locks.
  await client.query(
    `update amateur_duel_fight set engine_state=$2,status=$3,winner_user_id=$4,resolved_at=case when $5 then $6::timestamptz else resolved_at end,
    reason=case when $3='cancelled' then 'sudden_death_timeout' else reason end,revision=revision+1 where id=$1`,
    [fight.id, JSON.stringify(next), next.status, winner, terminal, new Date(ctx.nowMs)],
  );
  if (terminal) {
    if (winner !== null) {
      for (const p of ctx.participants) {
        const won = p.userId === winner;
        const inserted = await client.query(
          `insert into amateur_duel_fight_reward(fight_id,user_id,stars,experience,won) values($1,$2,$3,1,$4) on conflict do nothing returning user_id`,
          [fight.id, p.userId, won ? 1 : 0, won],
        );
        if (inserted.rowCount) {
          await client.query('update users set xp=xp+$2,experience=experience+1 where id=$1', [
            p.userId,
            won ? 1 : 0,
          ]);
          await client.query('insert into user_currency_account (user_id) values ($1) on conflict do nothing', [p.userId]);
          await client.query(
            `insert into currency_ledger (user_id,reason,available_delta,reserved_delta,balance_after,reserved_after,duel_match_id,metadata)
             select $1,'duel_fight_reward',0,0,balance,reserved_balance,$2,$3::jsonb
               from user_currency_account where user_id=$1 for update`,
            [p.userId,ctx.id,JSON.stringify({fight_id:fight.id,match_id:ctx.id,won,stars:won?1:0,experience:1})],
          );
        }
      }
    }
    if (winner === null) await resumeDuel(client, ctx, ctx.nowMs, null, 0);
    else await queueFightSnapshot(client, ctx.id);
  } else if (
    before.status !== next.status ||
    JSON.stringify(before.hp) !== JSON.stringify(next.hp) ||
    before.actions.length !== next.actions.length
  )
    await queueFightSnapshot(client, ctx.id);
  fight = await getFight(client, ctx.id);
  return fight;
}
