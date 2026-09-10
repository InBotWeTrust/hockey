alter table achievements
  add column reward_tokens integer not null default 0 check (reward_tokens >= 0);

create table user_reward_token_account (
  user_id uuid primary key references users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table achievement_token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  achievement_id text not null references achievements(id) on delete restrict,
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create temporary table achievement_economy_seed (
  id text primary key,
  coins integer not null,
  stars integer not null,
  experience integer not null,
  tokens integer not null
) on commit drop;

insert into achievement_economy_seed (id, coins, stars, experience, tokens)
values
  ('ideal-day', 0, 25, 25, 0),
  ('first-goal', 0, 1, 1, 0),
  ('first-daily-game', 0, 2, 2, 0),
  ('first-training', 0, 2, 2, 0),
  ('amateur-ticket', 25000, 250, 250, 5),
  ('pro-ticket', 0, 0, 0, 0),
  ('daily-sniper-streak', 0, 5, 5, 0),
  ('ice-hand', 0, 5, 5, 0),
  ('steady-tempo', 0, 5, 5, 0),
  ('third-period-decides', 0, 5, 5, 0),
  ('final-push', 0, 5, 5, 0),
  ('no-panic', 0, 5, 5, 0),
  ('dry-finish', 0, 5, 5, 0),
  ('keeping-fit', 0, 15, 15, 0),
  ('sniper-week', 0, 20, 20, 0),
  ('sniper-month', 0, 50, 50, 0),
  ('training-monster', 0, 5, 5, 0),
  ('rhythm-control', 0, 5, 5, 0),
  ('cold-start', 0, 3, 3, 0),
  ('no-warmup-needed', 0, 2, 2, 0),
  ('finish-machine', 0, 3, 3, 0),
  ('underdog', 0, 8, 8, 0),
  ('classic-speed', 0, 3, 3, 0),
  ('nervous-finish', 0, 8, 8, 0),
  ('stable-student', 0, 15, 15, 0),
  ('training-before-battle', 0, 5, 5, 0),
  ('dangerous-host', 0, 5, 5, 0),
  ('blowout', 0, 3, 3, 0),
  ('thin-edge', 0, 3, 3, 0),
  ('revenge', 0, 5, 5, 0),
  ('hunter-streak', 0, 10, 10, 0),
  ('clean-win', 0, 5, 5, 0),
  ('dangerous-guest', 0, 8, 8, 0),
  ('no-room-for-error', 0, 3, 3, 0),
  ('wallet', 0, 15, 15, 0),
  ('economical-master', 0, 25, 25, 1),
  ('regular-season-champion', 250, 50, 50, 3),
  ('regular-season-medalist', 220, 45, 45, 2),
  ('playoff-semifinal', 100, 50, 50, 1),
  ('playoff-final', 150, 75, 75, 2),
  ('tournament-cup', 1000, 100, 100, 5),
  ('dark-horse', 0, 25, 25, 0),
  ('death-bracket', 0, 25, 25, 0),
  ('series-comeback', 0, 35, 35, 0),
  ('no-shake', 0, 20, 20, 0),
  ('tournament-streak', 2500, 250, 250, 5),
  ('monthly-top-1', 1000, 100, 100, 3);

update achievements achievement
   set reward_currency = seed.coins,
       reward_stars = seed.stars,
       reward_experience = seed.experience,
       reward_tokens = seed.tokens,
       updated_at = now()
  from achievement_economy_seed seed
 where achievement.id = seed.id;

update achievements
   set availability = 'hidden', updated_at = now()
 where id in ('almost-perfect-training', 'handled-pressure', 'master-arsenal');

create temporary table bonus_game_economy_seed (
  slug text primary key,
  stars integer not null
) on commit drop;

insert into bonus_game_economy_seed (slug, stars)
values
  ('speed-beach', 5),
  ('speed-ski-resort', 5),
  ('speed-cyberpunk-yard', 5),
  ('speed-abandoned-waterpark', 7),
  ('speed-pirate-bay', 7),
  ('speed-north-pole', 7),
  ('speed-desert', 10),
  ('speed-volcanic-ice', 10),
  ('speed-castle', 10),
  ('speed-space', 15),
  ('accuracy-moscow', 5),
  ('accuracy-istanbul', 5),
  ('accuracy-rome', 5),
  ('accuracy-paris', 5),
  ('accuracy-london', 10),
  ('accuracy-new-york', 10),
  ('accuracy-rio-de-janeiro', 10),
  ('accuracy-cape-town', 15),
  ('accuracy-dubai', 15),
  ('accuracy-mumbai', 15),
  ('accuracy-singapore', 6),
  ('accuracy-beijing', 6),
  ('accuracy-tokyo', 25);

update bonus_game game
   set reward_coins = 0,
       reward_stars = seed.stars,
       reward_experience = seed.stars,
       access_type = 'free',
       unlock_price_stars = 0,
       revision = game.revision + 1,
       updated_at = now()
  from bonus_game_economy_seed seed
 where game.slug = seed.slug;

with speed_limits as (
  select game.id,
         greatest(1000, (game.qualification_rules->>'activeTimeMs')::integer - 5000) as active_time_ms,
         game.total_periods
    from bonus_game game
    join bonus_game_economy_seed seed on seed.slug = game.slug
   where game.skill_code = 'speed'
), updated_periods as (
  select game.id,
         limits.active_time_ms,
         jsonb_agg(
           jsonb_set(
             period.value,
             '{durationMs}',
             to_jsonb(
               (limits.active_time_ms / limits.total_periods)
               + case when period.ordinality = limits.total_periods
                   then limits.active_time_ms % limits.total_periods
                   else 0
                 end
             )
           ) order by period.ordinality
         ) as period_rules
    from bonus_game game
    join speed_limits limits on limits.id = game.id
    cross join lateral jsonb_array_elements(game.period_rules)
      with ordinality period(value, ordinality)
   group by game.id, limits.active_time_ms, limits.total_periods
)
update bonus_game game
   set qualification_rules = jsonb_set(
         game.qualification_rules,
         '{activeTimeMs}',
         to_jsonb(updated.active_time_ms)
       ),
       period_rules = updated.period_rules,
       updated_at = now()
  from updated_periods updated
 where game.id = updated.id;

create table bonus_game_daily_attempt_slot (
  user_id uuid not null references users(id) on delete cascade,
  local_date date not null,
  skill_code text not null check (skill_code in ('speed', 'accuracy')),
  slot smallint not null check (slot between 1 and 2),
  attempt_id uuid not null unique references bonus_game_attempt(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, skill_code, slot)
);
