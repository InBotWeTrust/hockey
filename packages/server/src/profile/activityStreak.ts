export const ACTIVITY_STREAK_CTES = `activity_days as (
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
