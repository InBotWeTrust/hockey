import type { PoolClient } from 'pg';
import { openFirstAchievementStages } from './stageProgress.js';
import { advanceBarResult, BAR_GAME_CHAINS, BAR_IDS, type BarResultState } from './barCatalog.js';
export type BarMode = 'character' | 'online';
export interface BarGameResult {
  eventId: string;
  game: string;
  occurredAt: Date;
  startedAt: Date;
  mode?: BarMode;
  eligible?: boolean;
  participants: Array<{
    userId: string;
    opponentId: string;
    won: boolean;
    eligible?: boolean;
    outcome?: 'win' | 'loss' | 'draw';
    qualifiers: Record<number, number>;
  }>;
}
async function launched(client: PoolClient, at: Date): Promise<boolean> {
  const result = await client.query<{ active: boolean }>(
    'select started_at <= $1 as active from bar_achievement_launch where singleton',
    [at],
  );
  return result.rows[0]?.active === true;
}
async function beginEvent(
  client: PoolClient,
  user: string,
  key: string,
  at: Date,
): Promise<boolean> {
  await client.query('select id from users where id=$1 for update', [user]);
  const result = await client.query(
    'insert into bar_achievement_events(user_id,event_key,occurred_at) values($1,$2,$3) on conflict do nothing returning event_key',
    [user, key, at],
  );
  return (result.rowCount ?? 0) > 0;
}
async function setValue(client: PoolClient, user: string, id: string, value: number, at: Date) {
  await client.query(
    `insert into bar_achievement_totals(user_id,achievement_id,value,updated_at) values($1,$2,$3,$4)
    on conflict(user_id,achievement_id) do update set value=greatest(bar_achievement_totals.value,excluded.value),updated_at=excluded.updated_at`,
    [user, id, value, at],
  );
}
/** Cache lifetime peaks even while a completed reward is waiting to be claimed. */
export async function refreshBarAchievementStages(client: PoolClient, user: string, now: Date) {
  await openFirstAchievementStages(client, user, now);
  await client.query(
    `update user_achievement_stages player set
    progress=jsonb_build_object('total',totals.value),
    completed_at=case when totals.value >= (definition.target->>'total')::int then $2::timestamptz else null end,
    completion_context=jsonb_build_object('source','bar_events')
    from achievement_stages definition,bar_achievement_totals totals
    where player.user_id=$1 and player.achievement_id=totals.achievement_id and totals.user_id=$1
      and player.achievement_id=definition.achievement_id and player.stage_number=definition.stage_number
      and player.achievement_id not in ('bar-9-character','bar-9-online')
      and player.claimed_at is null and player.completed_at is null and definition.is_enabled`,
    [user, now],
  );
  await client.query(
    `update user_achievement_stages player set
      progress=jsonb_build_object('total',player.stage_number), completed_at=$2::timestamptz,
      completion_context=jsonb_build_object('source','bar_events')
    from bar_achievement_state observed, achievement_stages definition
    where player.user_id=$1 and observed.user_id=$1
      and observed.key='exact:' || player.achievement_id
      and observed.state ? player.stage_number::text
      and player.achievement_id in ('bar-9-character','bar-9-online')
      and definition.achievement_id=player.achievement_id and definition.stage_number=player.stage_number
      and definition.is_enabled and player.claimed_at is null and player.completed_at is null`,
    [user, now],
  );
}
async function feats(
  client: PoolClient,
  user: string,
  values: Record<number, number>,
  mode: BarMode,
  at: Date,
) {
  for (const [number, level] of Object.entries(values)) {
    const id = `bar-${number}-${mode}`;
    if (!BAR_IDS.has(id) || !Number.isSafeInteger(level) || level <= 0) continue;
    if (number === '9') {
      await client.query(
        `insert into bar_achievement_state(user_id,key,state) values($1,$2,$3::jsonb)
         on conflict(user_id,key) do update set state=bar_achievement_state.state || excluded.state`,
        [user, `exact:${id}`, JSON.stringify({ [level]: true })],
      );
    } else await setValue(client, user, id, level, at);
  }
}
export async function observeBarFeats(
  client: PoolClient,
  user: string,
  eventKey: string,
  occurredAt: Date,
  qualifiers: Record<number, number>,
  mode: BarMode,
) {
  if (!Object.keys(qualifiers).length || !(await launched(client, occurredAt))) return;
  if (!(await beginEvent(client, user, `feat:${eventKey}`, occurredAt))) return;
  await feats(client, user, qualifiers, mode, occurredAt);
  await refreshBarAchievementStages(client, user, occurredAt);
}
async function visit(client: PoolClient, user: string, at: Date) {
  await client.query(
    `insert into bar_achievement_days(user_id,day)
    select id,($2::timestamptz at time zone timezone)::date from users where id=$1 on conflict do nothing`,
    [user, at],
  );
  const count = await client.query<{ total: number }>(
    'select count(*)::int as total from bar_achievement_days where user_id=$1',
    [user],
  );
  await setValue(client, user, 'bar-44-social', count.rows[0]!.total, at);
}
export async function recordBarGameResult(client: PoolClient, event: BarGameResult): Promise<void> {
  const chain = BAR_GAME_CHAINS[event.game];
  if (!chain || !(await launched(client, event.startedAt))) return;
  for (const p of [...event.participants].sort((a, b) => a.userId.localeCompare(b.userId))) {
    if (!(await beginEvent(client, p.userId, `result:${event.eventId}`, event.occurredAt)))
      continue;
    const mode = event.mode ?? (/^[0-9a-f-]{36}$/i.test(p.opponentId) ? 'online' : 'character');
    const eligible = event.eligible !== false && p.eligible !== false;
    const key = `${event.game}:${mode}`;
    const prior = await client.query<{ state: BarResultState }>(
      'select state from bar_achievement_state where user_id=$1 and key=$2',
      [p.userId, key],
    );
    const state = advanceBarResult(
      prior.rows[0]?.state,
      p.opponentId,
      p.won,
      eligible && p.outcome !== 'draw',
    );
    await client.query(
      `insert into bar_achievement_state(user_id,key,state) values($1,$2,$3)
      on conflict(user_id,key) do update set state=excluded.state`,
      [p.userId, key, JSON.stringify(state)],
    );
    await setValue(client, p.userId, `bar-${chain[0]}-${mode}`, state.wins, event.occurredAt);
    await setValue(client, p.userId, `bar-${chain[1]}-${mode}`, state.bestStreak, event.occurredAt);
    if (state.rematch)
      await setValue(client, p.userId, `bar-${chain[2]}-${mode}`, 1, event.occurredAt);
    if (eligible) {
      await feats(client, p.userId, p.qualifiers, mode, event.occurredAt);
      await visit(client, p.userId, event.occurredAt);
    }
    await refreshBarAchievementStages(client, p.userId, event.occurredAt);
  }
}
export async function recordBarMessage(
  client: PoolClient,
  user: string,
  id: string,
  character: string,
  at: Date,
  replied: boolean,
) {
  if (!(await launched(client, at))) return;
  if (!(await beginEvent(client, user, `message:${replied ? 'reply' : 'sent'}:${id}`, at))) return;
  if (!replied) await visit(client, user, at);
  const characters = [
    'igor',
    'daria',
    'veronika',
    'grigory',
    'oleg',
    'arsenich',
    'timofey',
    'maria',
    'elina',
  ];
  const index = characters.indexOf(character);
  if (replied && index >= 0) await setValue(client, user, `bar-${45 + index}-social`, 1, at);
  await refreshBarAchievementStages(client, user, at);
}
export async function recordBarCardPurchase(
  client: PoolClient,
  user: string,
  id: string,
  at: Date,
) {
  if (!(await launched(client, at)) || !(await beginEvent(client, user, `card:${id}`, at))) return;
  await setValue(client, user, 'bar-54-social', 1, at);
  await refreshBarAchievementStages(client, user, at);
}
