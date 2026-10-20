import type { FastifyInstance } from 'fastify';

/** Notifications are replaceable; authoritative contacts remain in the fight state. */
export async function drainFightOutbox(app: FastifyInstance): Promise<void> {
  const pending = await app.pg.query<{ id: string; match_id: string; revision: string }>(
    'select id,match_id,revision from amateur_duel_fight_outbox where published_at is null order by id limit 100',
  );
  const groups = new Map<string, { ids: string[]; revision: number }>();
  for (const row of pending.rows) {
    const group = groups.get(row.match_id) ?? { ids: [], revision: 0 };
    group.ids.push(row.id);
    group.revision = Math.max(group.revision, Number(row.revision));
    groups.set(row.match_id, group);
  }
  for (const [matchId, group] of groups) {
    try {
      await app.realtime.publish(`duel:fight:${matchId}`, {
        type: 'duel:fight_update',
        matchId,
        revision: group.revision,
      });
      // Do not acknowledge rows inserted while publication was in flight.
      await app.pg.query(
        'update amateur_duel_fight_outbox set published_at=clock_timestamp() where id=any($1::bigint[]) and published_at is null',
        [group.ids],
      );
    } catch (err) {
      app.log.warn({ err, matchId }, 'duel fight notification retained for retry');
    }
  }
}
