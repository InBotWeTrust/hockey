-- Add the dev-only endurance bonus track and persist its authoritative rolling
-- goal window on active attempts. Existing attempts remain null in both fields.

alter table bonus_game
  drop constraint bonus_game_skill_code_check,
  add constraint bonus_game_skill_code_check
    check (skill_code in ('speed', 'accuracy', 'marksmanship', 'endurance'));

alter table bonus_game_daily_attempt_slot
  drop constraint bonus_game_daily_attempt_slot_skill_code_check,
  add constraint bonus_game_daily_attempt_slot_skill_code_check
    check (skill_code in ('speed', 'accuracy', 'marksmanship', 'endurance'));

alter table bonus_game_period_log
  drop constraint bonus_game_period_log_closed_reason_check,
  add constraint bonus_game_period_log_closed_reason_check
    check (closed_reason in (
      'quota', 'timeout', 'target_reached', 'attempt_abandoned', 'goal_window_timeout'
    ));

alter table bonus_game_attempt
  add column goal_window_started_at timestamptz,
  add column goal_window_ends_at timestamptz,
  add constraint bonus_game_attempt_goal_window_pair_check check (
    (goal_window_started_at is null and goal_window_ends_at is null)
    or (
      goal_window_started_at is not null
      and goal_window_ends_at is not null
      and goal_window_ends_at > goal_window_started_at
    )
  );

insert into bonus_game
  (id, slug, title, skill_code, description, sort_order, status, access_type,
   unlock_price_stars, target_goals, qualification_rules, total_periods,
   break_duration_ms, period_rules, use_inventory,
   preview_title, preview_story, preview_artwork_url, preview_revision,
   reward_coins, reward_stars, reward_experience, arena_theme_id,
   goalkeeper_ready_url, goalkeeper_save_url, revision, created_by)
select seed.id,
       'endurance-' || seed.sort_order,
       'Выносливость ' || seed.sort_order,
       'endurance',
       'Продержитесь до конца, забивая хотя бы один гол в каждом окне.',
       seed.sort_order,
       'active',
       'free',
       0,
       1,
       jsonb_build_object(
         'type', 'survive_goal_windows',
         'activeTimeMs', seed.duration_ms,
         'goalWindowMs', seed.goal_window_ms
       ),
       1,
       0,
       jsonb_build_array(jsonb_build_object(
         'periodNumber', 1,
         'durationMs', seed.duration_ms,
         'shotsLimit', null,
         'goalFrequency', 0.5,
         'goalieFrequency', 0.6,
         'shooterFrequency', 0.75,
         'puckSpeedPerMs', 1.25,
         'goaliePattern', 'linear',
         'goalieAmplitude', 1,
         'goalAmplitude', 220
       )),
       false,
       'Выносливость ' || seed.sort_order,
       'Забивайте до конца каждого короткого окна и продержитесь до финальной сирены.',
       '/sprites/amateur-daily-court.webp',
       1,
       0,
       1,
       1,
       '00000000-0000-4000-8000-000000000700',
       '/sprites/training-goalie-amateur.webp',
       '/sprites/training-goalie-amateur-save.webp',
       1,
       null
  from (
    values
      ('00000000-0000-4000-8000-000000000711'::uuid, 1, 180000, 7000),
      ('00000000-0000-4000-8000-000000000712'::uuid, 2, 190000, 6500),
      ('00000000-0000-4000-8000-000000000713'::uuid, 3, 200000, 6000),
      ('00000000-0000-4000-8000-000000000714'::uuid, 4, 210000, 5500),
      ('00000000-0000-4000-8000-000000000715'::uuid, 5, 220000, 5000),
      ('00000000-0000-4000-8000-000000000716'::uuid, 6, 230000, 4000),
      ('00000000-0000-4000-8000-000000000717'::uuid, 7, 240000, 3000)
  ) seed(id, sort_order, duration_ms, goal_window_ms);
