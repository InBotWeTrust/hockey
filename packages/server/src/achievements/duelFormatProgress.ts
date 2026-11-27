import type { PoolClient } from 'pg';
import { PUCK_START, GOAL_OPENING } from '@hockey/game-core';
import { DUEL_FORMAT_IDS, DUEL_FORMAT_VARIANTS, duelFormatKey } from './duelFormatCatalog.js';
import {
  deriveDuelFormatFeats,
  isCompletedDuelFormat,
  type DuelFormatShot,
} from './duelFormatObservations.js';
import { openFirstAchievementStages } from './stageProgress.js';

async function setTotal(client: PoolClient, userId: string, id: string, value: number, at: Date) {
  if (!DUEL_FORMAT_IDS.has(id) || !Number.isSafeInteger(value) || value <= 0) return;
  await client.query(
    `insert into duel_format_achievement_totals(user_id,achievement_id,value,updated_at) values($1,$2,$3,$4)
    on conflict(user_id,achievement_id) do update set value=greatest(duel_format_achievement_totals.value,excluded.value),updated_at=excluded.updated_at`,
    [userId, id, value, at],
  );
}
export async function refreshDuelFormatAchievementStages(
  client: PoolClient,
  userId: string,
  at: Date,
) {
  await openFirstAchievementStages(client, userId, at);
  await client.query(
    `update user_achievement_stages player set progress=jsonb_build_object('total',totals.value),
    completed_at=case when totals.value >= (definition.target->>'total')::int then $2::timestamptz else null end,
    completion_context=jsonb_build_object('source','duel_format_results')
    from achievement_stages definition,duel_format_achievement_totals totals
    where player.user_id=$1 and totals.user_id=$1 and totals.achievement_id=player.achievement_id
      and definition.achievement_id=player.achievement_id and definition.stage_number=player.stage_number
      and definition.is_enabled and player.completed_at is null and player.claimed_at is null`,
    [userId, at],
  );
}
const asNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Called in the settlement transaction: no client-supplied outcome or feat is accepted. */
export async function recordDuelFormatAchievements(client: PoolClient, matchId: string) {
  const matchResult = await client.query<{
    duel_kind: string;
    rules_snapshot: unknown;
    winner_user_id: string | null;
    settled_reason: string | null;
    settled_at: Date;
  }>(
    `select m.duel_kind,m.rules_snapshot,m.winner_user_id,m.settled_reason,m.settled_at
    from amateur_duel_match m cross join duel_format_achievement_launch launch
    where m.id=$1 and launch.singleton and m.status='settled'
      and m.created_at>=launch.started_at and m.settled_at>=launch.started_at`,
    [matchId],
  );
  const match = matchResult.rows[0];
  if (!match) return;
  const rules = asObject(match.rules_snapshot),
    format = duelFormatKey(match.duel_kind, rules);
  if (!format) return;
  const { rows: players } = await client.query<{
    user_id: string;
    state: string;
    goals: number;
    shots_taken: number;
  }>(
    'select user_id,state,goals,shots_taken from amateur_duel_participant where match_id=$1 order by user_id',
    [matchId],
  );
  if (
    players.length !== 2 ||
    (match.winner_user_id !== null && !players.some((p) => p.user_id === match.winner_user_id))
  )
    return;
  // Consistent ordering also serializes this user's simultaneous results in other formats.
  await client.query('select id from users where id=any($1::uuid[]) order by id for update', [
    players.map((p) => p.user_id),
  ]);
  const eligible = isCompletedDuelFormat(
    match.settled_reason,
    players.map((p) => p.state),
  );
  let feats: Record<string, Record<string, number>> = {};
  if (eligible && ['sniper', 'marathon-4', 'marathon-7', 'rhythm'].includes(format)) {
    const { rows: shots } = await client.query<{
      user_id: string;
      server_result: 'goal' | 'save' | 'miss';
      awarded_points: number;
      input_payload: unknown;
    }>(
      `select user_id,server_result,awarded_points,input_payload from shot_session
        where mode='amateur_duel' and amateur_duel_match_id=$1 order by user_id,period_number,shot_index`,
      [matchId],
    );
    const participants = players.map((player) => ({
      userId: player.user_id,
      goals: Number(player.goals),
      shots: shots
        .filter((s) => s.user_id === player.user_id)
        .map((s): DuelFormatShot => {
          const payload = asObject(s.input_payload),
            speed = asNumber(payload.puckSpeedPerMs);
          return {
            result: s.server_result,
            points: Number(s.awarded_points),
            technique: typeof payload.sniperTechnique === 'string' ? payload.sniperTechnique : '',
            startedMs: asNumber(
              format.startsWith('marathon')
                ? (payload.periodTapTime ?? payload.tapTime)
                : payload.tapTime,
            ),
            flightMs: speed > 0 ? (PUCK_START.y - GOAL_OPENING.y) / speed : 0,
            travel: asNumber(payload.rhythmTravel),
            boardContacts: asNumber(payload.rhythmBoardContacts),
          };
        }),
    }));
    // Incomplete historical telemetry is not a proof of a within-match feat.
    const completeParticipants = participants.filter(
      (p) =>
        p.shots.length === Number(players.find((row) => row.user_id === p.userId)!.shots_taken),
    );
    const periods = Array.isArray(rules.periodRules) ? rules.periodRules : [];
    const durationMs = asNumber(
      asObject(periods[0]).durationMs,
      asNumber(rules.periodDurationMs, format.startsWith('marathon') ? 240000 : 180000),
    );
    const version = asNumber(rules.rhythmVersion, 4);
    feats = deriveDuelFormatFeats({
      format,
      durationMs,
      scoredClockVersion: asNumber(rules.scoredClockVersion),
      rhythmVersion: ([1, 2, 3, 4].includes(version) ? version : 4) as 1 | 2 | 3 | 4,
      winnerUserId: match.winner_user_id,
      participants: completeParticipants,
    });
  }
  for (const player of players) {
    const receipt = await client.query(
      `insert into duel_format_achievement_events(match_id,user_id) values($1,$2) on conflict do nothing returning match_id`,
      [matchId, player.user_id],
    );
    if (!receipt.rowCount) continue;
    const won = eligible && match.winner_user_id === player.user_id;
    const state = await client.query<{ wins: number; best_streak: number }>(
      `insert into duel_format_achievement_state(user_id,format,wins,streak,best_streak)
      values($1,$2,$3,$3,$3) on conflict(user_id,format) do update set
        wins=duel_format_achievement_state.wins+$3,
        streak=case when $3=1 then duel_format_achievement_state.streak+1 else 0 end,
        best_streak=greatest(duel_format_achievement_state.best_streak,case when $3=1 then duel_format_achievement_state.streak+1 else 0 end)
      returning wins,best_streak`,
      [player.user_id, format, won ? 1 : 0],
    );
    await setTotal(
      client,
      player.user_id,
      `duel-format-${format}-wins`,
      state.rows[0]!.wins,
      match.settled_at,
    );
    await setTotal(
      client,
      player.user_id,
      `duel-format-${format}-streak`,
      state.rows[0]!.best_streak,
      match.settled_at,
    );
    if (eligible)
      for (const [id, value] of Object.entries(feats[player.user_id] ?? {}))
        await setTotal(client, player.user_id, id, value, match.settled_at);
    const minimum = await client.query<{ total: number }>(
      `select min(coalesce(state.wins,0))::int as total
      from unnest($2::text[]) as variant(key) left join duel_format_achievement_state state on state.format=variant.key and state.user_id=$1`,
      [player.user_id, DUEL_FORMAT_VARIANTS.map((v) => v.key)],
    );
    await setTotal(
      client,
      player.user_id,
      'duel-universal',
      minimum.rows[0]!.total,
      match.settled_at,
    );
    await refreshDuelFormatAchievementStages(client, player.user_id, match.settled_at);
  }
}
