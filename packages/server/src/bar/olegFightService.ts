import { FIGHT_START_DELAY_MS } from '@hockey/game-core';
import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { FightCommand, FightState } from '@hockey/game-core';
import { AppError } from '../plugins/errors.js';
import { createOlegRuntime, advanceOlegRuntime, type OlegFightRuntime } from './olegBot.js';
interface FightRow {
  id: string;
  user_id: string;
  runtime: OlegFightRuntime;
  status: string;
  outcome: string | null;
  acknowledged: boolean;
}
export interface BarAccess {
  blockedUntil: string | null;
  fightId: string | null;
}
export async function readBarAccess(db: Pool | PoolClient, user: string): Promise<BarAccess> {
  const row = (
    await db.query<{ blockedUntil: string | null; fightId: string | null }>(
      `select
  case when c.blocked_until>now() then c.blocked_until::text else null end as "blockedUntil",
  (select id::text from bar_oleg_fights where user_id=u.id and (status='fighting' or not acknowledged) order by created_at desc limit 1) as "fightId"
  from users u left join bar_conflicts c on c.user_id=u.id where u.id=$1`,
      [user],
    )
  ).rows[0];
  return {
    blockedUntil: row?.blockedUntil ? new Date(row.blockedUntil).toISOString() : null,
    fightId: row?.fightId ?? null,
  };
}
export async function assertBarAccess(db: Pool | PoolClient, user: string): Promise<void> {
  const access = await readBarAccess(db, user);
  if (access.blockedUntil)
    throw new AppError('bar_closed', 'На сегодня бар закрыт для тебя.', 403, access);
  if (access.fightId)
    throw new AppError('bar_fight_pending', 'Сначала закончи драку с Олегом.', 409, access);
}
export async function startOlegFight(
  db: PoolClient,
  user: string,
  turnId?: string,
): Promise<string> {
  const existing = (
    await db.query<{ id: string }>(
      `select id from bar_oleg_fights where user_id=$1 and status='fighting'`,
      [user],
    )
  ).rows[0];
  if (existing) return existing.id;
  const clock = (await db.query<{ at: string }>('select clock_timestamp()::text as at')).rows[0]!;
  const runtime = createOlegRuntime(Date.parse(clock.at) + FIGHT_START_DELAY_MS, randomBytes(4).readUInt32LE());
  const result = await db.query<{ id: string }>(
    `insert into bar_oleg_fights(user_id,source_turn_id,runtime) values($1,$2,$3) returning id`,
    [user, turnId ?? null, JSON.stringify(runtime)],
  );
  return result.rows[0]!.id;
}
export class OlegFightService {
  private tickCursor: string | null = null;
  constructor(private readonly pool: Pool) {}
  async start(user: string): Promise<string> {
    const db = await this.pool.connect();
    try {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `bar-conversation:${user}`,
      ]);
      const access = await readBarAccess(db, user);
      if (access.blockedUntil)
        throw new AppError('bar_closed', 'На сегодня бар закрыт для тебя.', 403, access);
      if (access.fightId) {
        await db.query('commit');
        return access.fightId;
      }
      if (
        (
          await db.query(
            'select 1 from bar_conversations where user_id=$1 and pending_until>now() limit 1',
            [user],
          )
        ).rows.length
      )
        throw new AppError('conversation_busy', 'Дождись ответа собеседника.', 409);
      const id = await startOlegFight(db, user);
      await db.query('commit');
      return id;
    } catch (e) {
      await db.query('rollback');
      throw e;
    } finally {
      db.release();
    }
  }
  async read(
    user: string,
    id: string,
    action?: {
      actionId: string;
      seq: number;
      phaseId: number;
      kind: 'input' | 'attack';
      input?: { direction: -1 | 0 | 1; crouch: boolean; guard: boolean };
    },
  ): Promise<{
    id: string;
    state: FightState;
    serverNow: number;
    outcome: string | null;
    nextSeq: number;
  }> {
    const db = await this.pool.connect();
    try {
      await db.query('begin');
      const row = (
        await db.query<FightRow>(
          'select * from bar_oleg_fights where id=$1 and user_id=$2 for update',
          [id, user],
        )
      ).rows[0];
      if (!row) throw new AppError('not_found', 'Драка не найдена.', 404);
      const now = Date.parse(
        (await db.query<{ at: string }>('select clock_timestamp()::text as at')).rows[0]!.at,
      );
      if (row.status === 'cancelled') {
        await db.query('commit');
        return {
          id,
          state: row.runtime.state,
          serverNow: now,
          outcome: 'cancelled',
          nextSeq: row.runtime.state.lastSeq[0] + 1,
        };
      }
      let runtime = advanceOlegRuntime(row.runtime, now);
      if (action) {
        const previous = (
          await db.query<{ payload: unknown }>(
            'select payload from bar_oleg_fight_commands where fight_id=$1 and (action_id=$2 or seq=$3)',
            [id, action.actionId, action.seq],
          )
        ).rows[0];
        if (previous) {
          if (
            JSON.stringify(previous.payload) !== JSON.stringify(JSON.parse(JSON.stringify(action)))
          ) {
            // jsonb key order differs; compare normalized objects below.
            const stored = previous.payload as typeof action;
            if (
              stored.actionId !== action.actionId ||
              stored.seq !== action.seq ||
              stored.phaseId !== action.phaseId ||
              stored.kind !== action.kind ||
              stored.input?.direction !== action.input?.direction ||
              stored.input?.crouch !== action.input?.crouch ||
              stored.input?.guard !== action.input?.guard
            )
              throw new AppError('fight_conflict', 'Повторная команда изменилась.', 409);
          }
        } else {
          const state = runtime.state;
          if (state.status !== 'fighting' && state.status !== 'sudden_death')
            throw new AppError('fight_conflict', 'Драка уже закончилась.', 409);
          if (
            action.seq !== state.lastSeq[0] + 1 ||
            action.phaseId !== state.phaseId ||
            now < state.phaseStartedAtMs
          )
            throw new AppError('fight_conflict', 'Обнови состояние драки.', 409);
          const at = Math.max(now, state.finalizedThroughMs + 1);
          const base = {
            player: 0 as const,
            phaseId: action.phaseId,
            seq: action.seq,
            effectiveAtMs: at,
            actionId: action.actionId,
          };
          const command: FightCommand =
            action.kind === 'input'
              ? { ...base, kind: 'input', input: action.input! }
              : { ...base, kind: 'attack', zone: 'head' };
          runtime = advanceOlegRuntime(runtime, at, [command]);
          await db.query(
            'insert into bar_oleg_fight_commands(fight_id,action_id,seq,payload) values($1,$2,$3,$4)',
            [id, action.actionId, action.seq, JSON.stringify(action)],
          );
        }
      }
      const terminal = ['resolved', 'cancelled'].includes(runtime.state.status);
      const outcome = terminal
        ? runtime.state.status === 'cancelled'
          ? 'draw'
          : runtime.state.winner === 0
            ? 'win'
            : runtime.state.winner === 1
              ? 'loss'
              : 'draw'
        : null;
      await db.query(
        'update bar_oleg_fights set runtime=$2,status=$3,outcome=$4,ended_at=case when $4::text is not null then to_timestamp($5::double precision/1000) else null end where id=$1',
        [
          id,
          JSON.stringify(runtime),
          terminal ? 'resolved' : 'fighting',
          outcome,
          runtime.state.endedAtMs ?? now,
        ],
      );
      if (outcome === 'loss' && row.status === 'fighting') {
        await db.query(
          `insert into bar_conflicts(user_id,day,blocked_until) select id,(now() at time zone coalesce(timezone,'UTC'))::date,
     (((to_timestamp($2::double precision/1000) at time zone coalesce(timezone,'UTC'))::date+1)::timestamp at time zone coalesce(timezone,'UTC')) from users where id=$1
     on conflict(user_id) do update set blocked_until=greatest(bar_conflicts.blocked_until,excluded.blocked_until),updated_at=now()`,
          [user, runtime.state.endedAtMs ?? now],
        );
      }
      await db.query('commit');
      return {
        id,
        state: runtime.state,
        serverNow: now,
        outcome,
        nextSeq: runtime.state.lastSeq[0] + 1,
      };
    } catch (e) {
      await db.query('rollback');
      throw e;
    } finally {
      db.release();
    }
  }
  async acknowledge(user: string, id: string): Promise<void> {
    await this.pool.query(
      "update bar_oleg_fights set acknowledged=true where id=$1 and user_id=$2 and status<>'fighting'",
      [id, user],
    );
  }
  async tick(): Promise<void> {
    const rows = (
      await this.pool.query<{ id: string; user_id: string }>(
        "select id,user_id from bar_oleg_fights where status='fighting' and ($1::uuid is null or id>$1::uuid) order by id limit 100",
        [this.tickCursor],
      )
    ).rows;
    this.tickCursor = rows.length === 100 ? rows[rows.length - 1]!.id : null;
    let failed = false;
    for (const row of rows) {
      try {
        await this.read(row.user_id, row.id);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error('bar_fight_tick_failed');
  }
}
