import { drainFightOutbox } from './outbox.js';
import type { FightState } from '@hockey/game-core';
import type { FastifyInstance } from 'fastify';
import type { FightDuelAdapter } from './routes.js';
import { advancePersistedFight, FIGHT_RESULT_HOLD_MS } from './service.js';
export function startFightWorker(
  app: FastifyInstance,
  adapter: FightDuelAdapter,
): () => Promise<void> {
  const checked = new Map<string, number>();
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = async () => {
    const pending = await app.pg.query<{
      match_id: string;
      initiator_user_id: string;
      status: string;
      response_deadline_at: Date;
      starts_at: Date | null;
      resolved_at: Date | null;
      engine_state: FightState | null;
      aid_until: Date | null;
    }>(
      `select f.match_id,f.initiator_user_id,f.status,f.response_deadline_at,f.starts_at,f.resolved_at,f.engine_state,
        (select max(p.fight_aid_until) from amateur_duel_participant p where p.match_id=f.match_id) as aid_until
       from amateur_duel_fight f join amateur_duel_match m on m.id=f.match_id
       where (f.status in ('offered','starting','fighting','sudden_death') or
        (f.status in ('resolved','cancelled') and (m.fight_paused_at is not null or exists
          (select 1 from amateur_duel_participant p where p.match_id=f.match_id and p.fight_aid_until is not null))))
       and (f.runtime_version=0 or f.status not in ('starting','fighting','sudden_death'))
       and f.id=(select latest.id from amateur_duel_fight latest where latest.match_id=f.match_id
         order by latest.offered_at desc,latest.id desc limit 1)
       order by f.offered_at`,
    );
    for (const row of pending.rows) {
      const now = Date.now();
      const state = row.engine_state;
      const due =
        ['resolved','cancelled'].includes(row.status)
          ? now >= (row.aid_until?.getTime() ?? ((row.resolved_at?.getTime() ?? Infinity) + FIGHT_RESULT_HOLD_MS))
          : row.status === 'offered'
          ? now >= row.response_deadline_at.getTime()
          : row.status === 'starting'
            ? now >= (row.starts_at?.getTime() ?? Infinity)
            : state !== null &&
              (now >= state.deadlineMs + state.rules.deliveryGraceMs ||
                state.actions.some(
                  (a) =>
                    a.kind === 'attack' &&
                    !a.resolved &&
                    now >=
                      Math.min(state.rules.version >= 3 ? a.activeAtMs : a.activeUntilMs, state.deadlineMs) + state.rules.deliveryGraceMs,
                ));
      const frame=state?.responsive?.timeline.at(-1);
      const responsiveDue=state?.rules.version !== undefined && state.rules.version>=3 && frame &&
        [...frame.leaseUntil,...frame.players.map(p=>p.readyAtMs)].some(t=> t>=state.phaseStartedAtMs && now>=t+state.rules.deliveryGraceMs && (checked.get(row.match_id)??0)<t+state.rules.deliveryGraceMs);
      if (!due && !responsiveDue && now - (checked.get(row.match_id) ?? 0) < 1000) continue;
      checked.set(row.match_id, now);
      await adapter
        .transact(async (c) => {
          const ctx = await adapter.prepare(c, row.match_id, row.initiator_user_id);
          await advancePersistedFight(c, ctx);
        })
        .catch((err) =>
          app.log.error({ err, matchId: row.match_id }, 'duel fight progression failed'),
        );
    }
    for (const id of checked.keys())
      if (!pending.rows.some((row) => row.match_id === id)) checked.delete(id);

  };
  const timer = setInterval(() => {
    if (stopped || running) return;
    running = tick()
      .catch((err) => app.log.error({ err }, 'duel fight worker failed'))
      .finally(() => {
        running = null;
      });
  }, 10);
  timer.unref();
  let publishing: Promise<void> | null = null;
  const publishTimer = setInterval(() => {
    if (stopped || publishing) return;
    publishing = drainFightOutbox(app)
      .catch(err => app.log.error({ err }, 'duel fight outbox failed'))
      .finally(() => { publishing = null; });
  }, 10);
  publishTimer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(publishTimer);
    await Promise.all([running, publishing]);
  };
}
