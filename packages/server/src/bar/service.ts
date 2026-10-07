import type { Pool } from 'pg';
import {
  getGoalie,
  GOALIES,
  getSessionPhaseOffsets,
  simulateShooter,
  getPerspectiveCourtGoalOpening,
  getPerspectiveCourtGoalieHitbox,
  STICK_NEUTRAL,
  type ShotInput,
} from '@hockey/game-core';
import type { BarBoard, BarLive, BarMatch, BarPlayer, BarShot } from './types.js';

export const BAR_PAGE_SIZE = 40;
export const BAR_DELAY_MS = 3000;

// A tournament fixture is the public identity, regardless of internal attempts/segments.
const PUBLIC_MATCHES = `with entries as (
  select m.id, 'duel'::text as kind, null::text as title, m.id as match_id,
         m.challenger_user_id as home_user_id, m.opponent_user_id as away_user_id,
         m.status, m.starts_at, m.ends_at, m.ready_expires_at,
         0::int as home_score, 0::int as away_score
    from amateur_duel_match m
   where not exists (select 1 from tournament_fixture_segment s where s.duel_match_id = m.id)
     and not exists (select 1 from tournament_fixture_attempt a where a.amateur_duel_match_id = m.id)
  union all
  select f.id, 'tournament', t.title, case when attempt.id is not null then attempt.amateur_duel_match_id else segment.duel_match_id end,
         hp.user_id, ap.user_id, f.status, coalesce(attempt.scheduled_starts_at, f.scheduled_starts_at),
         coalesce(attempt.hard_deadline_at, f.window_ends_at), null::timestamptz,
         f.home_score, f.away_score
    from tournament_fixture f
    join tournament t on t.id = f.tournament_id and t.visibility = 'public'
      and t.status not in ('draft', 'cancelled', 'archived', 'paused')
    join tournament_participant hp on hp.id = f.home_participant_id
    join tournament_participant ap on ap.id = f.away_participant_id
    left join lateral (
      select a.id, a.amateur_duel_match_id, a.scheduled_starts_at, a.hard_deadline_at
        from tournament_fixture_attempt a where a.fixture_id = f.id
        order by a.attempt_number desc limit 1
    ) attempt on true
    left join lateral (
      select s.duel_match_id from tournament_fixture_segment s where s.fixture_id = f.id
       order by s.sequence_number desc limit 1
    ) segment on true
), public_matches as (
  select e.*, m.status as duel_status, m.rules_snapshot, m.fight_paused_at, m.updated_at as match_updated_at,
         case when e.status in ('settled','forfeit','cancelled','expired') then 'finished'
              when e.kind = 'duel' and m.status = 'active' and m.ends_at <= $1 then 'finished'
              when m.status = 'active' and m.ends_at > $1 then 'online'
              else 'upcoming' end as match_group
    from entries e left join amateur_duel_match m on m.id = e.match_id
)`;

interface PlayerRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  grip: 'left' | 'right';
  goals: number | null;
  state: string | null;
  current_period: number | null;
  period_started_at: Date | null;
  break_started_at: Date | null;
  period_paused_ms: number | null;
  period_paused_at: Date | null;
}
interface MatchRow {
  id: string;
  kind: 'duel' | 'tournament';
  title: string | null;
  match_id: string | null;
  status: string;
  duel_status: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  ready_expires_at: Date | null;
  match_group: BarMatch['group'];
  home_user_id: string;
  away_user_id: string;
  home_score: number;
  away_score: number;
  rules_snapshot: {
    goalieId?: string;
    periodDurationMs?: number;
    breakDurationMs?: number;
    totalPeriods?: number;
    periodRules?: Array<{ periodNumber: number; durationMs: number }>;
  } | null;
  fight_paused_at: Date | null;
  match_updated_at?: Date | null;
}

export function isVisibleEntry(
  row: Pick<
    MatchRow,
    'kind' | 'status' | 'duel_status' | 'starts_at' | 'ends_at' | 'ready_expires_at'
  >,
  now: Date,
): boolean {
  if (['settled', 'forfeit', 'cancelled', 'expired', 'conditional', 'paused'].includes(row.status))
    return false;
  if (row.kind === 'duel') {
    if (!['invited', 'ready_check', 'active'].includes(row.status)) return false;
    if (row.ends_at !== null && row.ends_at <= now) return false;
    return row.ready_expires_at === null || row.ready_expires_at > now;
  }
  return row.starts_at !== null && (row.ends_at === null || row.ends_at > now);
}

export function projectPlayer(player: PlayerRow, row: MatchRow, now: Date): BarPlayer {
  let state = player.state ?? 'waiting';
  let until: Date | null = null;
  const period = Number(player.current_period ?? 0);
  const rules = row.rules_snapshot;
  if (row.fight_paused_at !== null || player.period_paused_at !== null) state = 'paused';
  else if (state === 'period_active' && player.period_started_at !== null) {
    const duration =
      rules?.periodRules?.find((p) => p.periodNumber === period)?.durationMs ??
      rules?.periodDurationMs;
    if (duration !== undefined) {
      until = new Date(
        player.period_started_at.getTime() + duration + Number(player.period_paused_ms ?? 0),
      );
      if (until <= now) state = period >= (rules?.totalPeriods ?? 3) ? 'completed' : 'waiting';
    }
  } else if (state === 'break_active' && player.break_started_at !== null) {
    until = new Date(player.break_started_at.getTime() + (rules?.breakDurationMs ?? 0));
    if (until <= now) state = 'waiting';
  }
  return {
    userId: player.user_id,
    name: player.display_name,
    avatarUrl: player.avatar_url,
    grip: player.grip,
    goals: Number(player.goals ?? 0),
    state,
    period,
    until: until?.toISOString() ?? null,
  };
}

async function playersFor(
  pool: Pool,
  rows: MatchRow[],
  now: Date,
  delayedAt: Date | null = null,
): Promise<BarMatch[]> {
  if (rows.length === 0) return [];
  const players = await pool.query<PlayerRow & { match_id: string | null }>(
    `select u.id as user_id, u.display_name, u.avatar_url, u.grip,
            p.match_id,
            greatest(0, p.goals - case when $3::timestamptz is null then 0 else (
              select count(*)::int from shot_session recent
               where recent.amateur_duel_match_id = p.match_id and recent.user_id = p.user_id
                 and recent.mode = 'amateur_duel' and recent.server_result = 'goal'
                 and recent.created_at > $3::timestamptz
            ) end) as goals, p.state, p.current_period, p.period_started_at, p.break_started_at,
            p.period_paused_ms, p.period_paused_at
       from users u left join amateur_duel_participant p
         on p.user_id = u.id and p.match_id = any($2::uuid[])
      where u.id = any($1::uuid[])`,
    [
      rows.flatMap((r) => [r.home_user_id, r.away_user_id]),
      rows.map((r) => r.match_id).filter(Boolean),
      delayedAt,
    ],
  );
  return rows.flatMap((row) => {
    const player = (id: string) =>
      players.rows.find((p) => p.user_id === id && p.match_id === row.match_id) ??
      players.rows.find((p) => p.user_id === id);
    const home = player(row.home_user_id);
    const away = player(row.away_user_id);
    if (!home || !away) return [];
    // A scheduled fixture may share users with another active match. Never borrow its participant state.
    const publicPlayer = (p: PlayerRow & { match_id: string | null }, score: number) =>
      projectPlayer(
        p.match_id === row.match_id
          ? p
          : {
              ...p,
              goals: score,
              state: null,
              current_period: null,
              period_started_at: null,
              break_started_at: null,
              period_paused_ms: null,
              period_paused_at: null,
            },
        row,
        now,
      );
    return [
      {
        id: row.id,
        kind: row.kind,
        title: row.title,
        group: row.match_group,
        status: row.status,
        startsAt: row.starts_at?.toISOString() ?? null,
        expiresAt: (row.ready_expires_at ?? row.ends_at)?.toISOString() ?? null,
        players: [publicPlayer(home, row.home_score), publicPlayer(away, row.away_score)],
      },
    ];
  });
}

export async function getBarBoard(pool: Pool, page: number, now = new Date()): Promise<BarBoard> {
  const visible = `status in ('invited','ready_check','active','scheduled','open')
    and (ends_at is null or ends_at > $1)
    and (ready_expires_at is null or ready_expires_at > $1)
    and (kind = 'duel' or starts_at is not null)`;
  const { rows } = await pool.query<MatchRow & { online_total: number; upcoming_total: number }>(
    `${PUBLIC_MATCHES}, visible_matches as (
      select * from public_matches where ${visible}
    ), totals as (
      select count(*) filter (where match_group = 'online')::int as online_total,
             count(*) filter (where match_group = 'upcoming')::int as upcoming_total
      from visible_matches
    ), paged as (
      (select * from visible_matches where match_group = 'online'
       order by starts_at desc, id limit $2 offset $3)
      union all
      (select * from visible_matches where match_group = 'upcoming'
       order by starts_at, id limit $2 offset $3)
    )
    select paged.*, totals.online_total, totals.upcoming_total
    from totals left join paged on true`,
    [now, BAR_PAGE_SIZE + 1, page * BAR_PAGE_SIZE],
  );
  const onlineRows = rows.filter(
    (r) => r.id !== null && r.match_group === 'online' && isVisibleEntry(r, now),
  );
  const upcomingRows = rows.filter(
    (r) => r.id !== null && r.match_group === 'upcoming' && isVisibleEntry(r, now),
  );
  const matches = await playersFor(
    pool,
    [...onlineRows.slice(0, BAR_PAGE_SIZE), ...upcomingRows.slice(0, BAR_PAGE_SIZE)],
    now,
  );
  return {
    totals: {
      online: Number(rows[0]?.online_total ?? 0),
      upcoming: Number(rows[0]?.upcoming_total ?? 0),
    },
    online: matches.filter((r) => r.group === 'online'),
    upcoming: matches.filter((r) => r.group === 'upcoming'),
    hasMore: onlineRows.length > BAR_PAGE_SIZE || upcomingRows.length > BAR_PAGE_SIZE,
    page,
  };
}

export async function getBarLive(
  pool: Pool,
  kind: 'duel' | 'tournament',
  id: string,
  now = new Date(),
): Promise<BarLive> {
  const { rows } = await pool.query<MatchRow>(
    `${PUBLIC_MATCHES}
    select * from public_matches where kind = $2 and id = $3`,
    [now, kind, id],
  );
  const row = rows[0];
  if (!row || ['cancelled', 'expired', 'conditional', 'paused'].includes(row.status))
    return { match: null, shots: [], complete: true, playbackId: null };
  if (
    row.kind === 'duel' &&
    row.status === 'active' &&
    row.ends_at !== null &&
    row.ends_at <= now
  ) {
    row.match_group = 'finished';
  }
  const publicRow =
    row.match_group === 'upcoming'
      ? { ...row, match_id: null, home_score: 0, away_score: 0, fight_paused_at: null }
      : row;
  const match =
    (await playersFor(pool, [publicRow], now, new Date(now.getTime() - BAR_DELAY_MS)))[0] ?? null;
  if (match?.group === 'upcoming') return { match, shots: [], complete: false, playbackId: null };
  if (match === null || row.match_id === null)
    return {
      match,
      shots: [],
      complete: match === null || match.group === 'finished',
      playbackId: null,
    };
  if (match.group !== 'finished' && row.ends_at !== null && row.ends_at <= now) {
    match.group = 'finished';
  }
  if (match.group === 'finished') {
    match.players.forEach((p, index) => {
      p.state = p.state === 'forfeit' ? 'forfeit' : 'completed';
      if (
        kind === 'tournament' &&
        ['settled', 'forfeit'].includes(row.status) &&
        (row.match_updated_at == null ||
          now.getTime() - row.match_updated_at.getTime() >= BAR_DELAY_MS + 2000)
      ) {
        p.goals = index === 0 ? Number(row.home_score) : Number(row.away_score);
      }
    });
  }
  const result = await pool.query<{
    id: string;
    user_id: string;
    period_number: number;
    shot_index: number;
    server_result: BarShot['result'];
    created_at: Date;
    input_payload: ShotInput;
    seed: string;
    match_seed: string;
  }>(
    `select s.id, s.user_id, s.period_number, s.shot_index, s.server_result, s.created_at,
            s.input_payload, s.seed, m.match_seed
       from shot_session s join amateur_duel_match m on m.id = s.amateur_duel_match_id
      where s.mode = 'amateur_duel' and s.amateur_duel_match_id = $1
        and s.created_at <= $2 and s.created_at > $3
      order by s.created_at desc, s.id desc limit 40`,
    [row.match_id, new Date(now.getTime() - BAR_DELAY_MS), new Date(now.getTime() - 45000)],
  );
  const cfg = getGoalie(row.rules_snapshot?.goalieId ?? GOALIES[0]!.id);
  const shots = result.rows.reverse().map((s): BarShot => {
    const phases = getSessionPhaseOffsets(s.match_seed);
    const input = s.input_payload;
    const opening = getPerspectiveCourtGoalOpening(input, cfg, phases);
    const goalie = getPerspectiveCourtGoalieHitbox(
      input,
      cfg,
      s.seed,
      s.shot_index,
      STICK_NEUTRAL,
      phases,
    );
    return {
      id: s.id,
      userId: s.user_id,
      period: s.period_number,
      index: s.shot_index,
      result: s.server_result,
      createdAt: s.created_at.toISOString(),
      shooterX: simulateShooter(
        (input.shooterMotionTime ?? input.shooterTapTime ?? input.tapTime) + phases.shooter,
        input.shooterFrequency,
      ).x,
      goalX: (opening.xMin + opening.xMax) / 2,
      goalieX: goalie.centerX,
    };
  });
  const complete =
    match.group === 'finished' &&
    (row.match_updated_at == null ||
      now.getTime() - row.match_updated_at.getTime() >= BAR_DELAY_MS + 2000);
  if (match.group === 'finished' && !complete) match.group = 'online';
  return { match, shots, complete, playbackId: row.match_id };
}
