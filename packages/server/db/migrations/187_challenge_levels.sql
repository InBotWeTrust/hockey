alter table bonus_game_attempt add column challenge_level smallint check (challenge_level between 1 and 3);
alter table bonus_game_economy_event add column challenge_level smallint check (challenge_level between 1 and 3);

create table user_bonus_game_level_completion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  bonus_game_id uuid not null references bonus_game(id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  attempt_id uuid references bonus_game_attempt(id) on delete set null,
  reward_snapshot jsonb not null,
  completed_at timestamptz not null,
  source text not null check (source in ('first_clear', 'legacy_credit')),
  unique (user_id, bonus_game_id, level)
);

insert into user_bonus_game_level_completion
  (user_id, bonus_game_id, level, attempt_id, reward_snapshot, completed_at, source)
select completion.user_id, completion.bonus_game_id, levels.level, completion.attempt_id,
       completion.reward_snapshot, completion.completed_at, 'legacy_credit'
from user_bonus_game_completion completion
join bonus_game game on game.id = completion.bonus_game_id
cross join generate_series(1, 3) levels(level)
where game.slug in ('challenge-beach', 'challenge-ski-resort', 'challenge-cyberpunk-yard')
on conflict (user_id, bonus_game_id, level) do nothing;

drop index bonus_game_economy_one_first_clear_reward_idx;
create unique index bonus_game_economy_one_first_clear_reward_idx
  on bonus_game_economy_event (user_id, bonus_game_id, coalesce(challenge_level, 0))
  where kind = 'first_clear_reward';
