import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';

export const statRatingMetricSchema = z.enum(['goals', 'accuracy', 'streak']);
export type StatRatingMetric = z.infer<typeof statRatingMetricSchema>;

const cursorSchema = z.object({ place: z.number().int().positive() });

function decodeCursor(value: string): number {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const result = cursorSchema.safeParse(parsed);
    if (result.success) return result.data.place;
  } catch {
    // Converted to a public API error below.
  }
  throw new AppError('bad_request', 'invalid profile rating cursor', 400);
}

function encodeCursor(place: number): string {
  return Buffer.from(JSON.stringify({ place }), 'utf8').toString('base64url');
}

const streakCtes = `activity_days as (
  select distinct s.user_id, (s.created_at at time zone u.timezone)::date as day
    from shot_session s
    join users u on u.id = s.user_id
   where s.mode in ('daily', 'amateur_duel', 'tournament_classic')
),
anchors as (
  select u.id as user_id, max(a.day) filter (
    where a.day between (now() at time zone u.timezone)::date - 1
                           and (now() at time zone u.timezone)::date
  ) as anchor_day
    from users u left join activity_days a on a.user_id = u.id
   group by u.id
),
descending_days as (
  select a.user_id, a.day, n.anchor_day,
         row_number() over (partition by a.user_id order by a.day desc) as rn
    from activity_days a join anchors n on n.user_id = a.user_id
   where n.anchor_day is not null and a.day <= n.anchor_day
),
current_streaks as (
  select user_id, count(*) filter (where day = anchor_day - (rn::int - 1))::int as current_days
    from descending_days group by user_id
),
grouped_days as (
  select user_id, day,
         day - (row_number() over (partition by user_id order by day))::int as streak_group
    from activity_days
),
historical_streaks as (
  select user_id, max(days)::int as best_days
    from (select user_id, streak_group, count(*)::int as days
            from grouped_days group by user_id, streak_group) grouped
   group by user_id
)`;

function metricSql(metric: StatRatingMetric): { ctes: string; eligible: string; order: string } {
  if (metric === 'accuracy') {
    return {
      ctes: '',
      eligible: 'u.lifetime_goals_total >= 1000',
      order: 'accuracy desc, goals desc, shots asc, id asc',
    };
  }
  if (metric === 'streak') {
    return {
      ctes: `${streakCtes},`,
      eligible: 'true',
      order: 'record_days desc, current_days desc, id asc',
    };
  }
  return { ctes: '', eligible: 'true', order: 'goals desc, accuracy desc, shots asc, id asc' };
}

interface StatRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  goals: number;
  shots: number;
  accuracy: string;
  current_days: number;
  record_days: number;
  place: number;
}

function toPlayer(row: StatRow) {
  return {
    place: Number(row.place),
    userId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    goals: Number(row.goals),
    shots: Number(row.shots),
    accuracy: Number(row.accuracy) * 100,
    currentStreakDays: Number(row.current_days),
    recordStreakDays: Number(row.record_days),
  };
}

export async function listStatRating(
  pg: Pool,
  viewerUserId: string,
  metric: StatRatingMetric,
  options: { limit: number; cursor?: string },
) {
  const afterPlace = options.cursor === undefined ? 0 : decodeCursor(options.cursor);
  const config = metricSql(metric);
  const base = `${config.ctes}
base as (
  select u.id, u.display_name, u.avatar_url,
         u.lifetime_goals_total::int as goals,
         u.lifetime_shots_total::int as shots,
         coalesce(u.lifetime_goals_total::numeric / nullif(u.lifetime_shots_total, 0), 0) as accuracy,
         coalesce(cs.current_days, 0)::int as current_days,
         greatest(coalesce(hs.best_days, 0), coalesce(cs.current_days, 0))::int as record_days
    from users u
    ${metric === 'streak' ? 'left join current_streaks cs on cs.user_id = u.id left join historical_streaks hs on hs.user_id = u.id' : 'left join (select null::uuid as user_id, 0::int as current_days) cs on false left join (select null::uuid as user_id, 0::int as best_days) hs on false'}
   where ${config.eligible}
),
ranked as (
  select base.*, row_number() over (order by ${config.order})::int as place from base
)`;
  const page = await pg.query<StatRow>(
    `with ${base} select * from ranked where place > $1 order by place limit $2`,
    [afterPlace, options.limit + 1],
  );
  const viewer = await pg.query<StatRow>(`with ${base} select * from ranked where id = $1`, [
    viewerUserId,
  ]);
  const viewerTotals = await pg.query<{ goals: number }>(
    'select lifetime_goals_total::int as goals from users where id = $1',
    [viewerUserId],
  );
  if (viewerTotals.rows[0] === undefined) throw new AppError('not_found', 'user not found', 404);

  const hasNextPage = page.rows.length > options.limit;
  const visible = page.rows.slice(0, options.limit);
  const last = visible.at(-1);
  return {
    metric,
    rows: visible.map(toPlayer),
    nextCursor: hasNextPage && last !== undefined ? encodeCursor(Number(last.place)) : null,
    currentUser: viewer.rows[0] === undefined ? null : toPlayer(viewer.rows[0]),
    eligibility:
      metric === 'accuracy'
        ? {
            eligible: viewer.rows[0] !== undefined,
            goals: Number(viewerTotals.rows[0].goals),
            requiredGoals: 1000,
          }
        : { eligible: true },
  };
}
