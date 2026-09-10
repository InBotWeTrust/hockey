-- Editable ordinary-duel rewards. Existing legacy reward columns remain during
-- the compatibility window; new matches use this complete, immutable matrix.

alter table amateur_duel_template
  add column if not exists reward_rules jsonb not null default '{
    "equalExperienceTolerancePercent": 10,
    "strongerWin": { "coins": 0, "stars": 0, "tokens": 0 },
    "equalWin": { "coins": 0, "stars": 0, "tokens": 0 },
    "weakerWin": { "coins": 0, "stars": 0, "tokens": 0 },
    "draw": { "coins": 0, "stars": 0, "tokens": 0 },
    "loss": { "coins": 0, "stars": 0, "tokens": 0 }
  }'::jsonb;

alter table amateur_duel_match
  add column if not exists reward_rules jsonb not null default '{
    "equalExperienceTolerancePercent": 10,
    "strongerWin": { "coins": 0, "stars": 0, "tokens": 0 },
    "equalWin": { "coins": 0, "stars": 0, "tokens": 0 },
    "weakerWin": { "coins": 0, "stars": 0, "tokens": 0 },
    "draw": { "coins": 0, "stars": 0, "tokens": 0 },
    "loss": { "coins": 0, "stars": 0, "tokens": 0 }
  }'::jsonb;

create function duel_reward_rules_valid(reward_rules jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(reward_rules) = 'object'
    and reward_rules ?& array['equalExperienceTolerancePercent', 'strongerWin', 'equalWin', 'weakerWin', 'draw', 'loss']
    and reward_rules - array['equalExperienceTolerancePercent', 'strongerWin', 'equalWin', 'weakerWin', 'draw', 'loss']::text[] = '{}'::jsonb
    and jsonb_typeof(reward_rules -> 'equalExperienceTolerancePercent') = 'number'
    and reward_rules ->> 'equalExperienceTolerancePercent' ~ '^(0|[1-9][0-9]?|100)$'
    and jsonb_typeof(reward_rules -> 'strongerWin') = 'object'
    and jsonb_typeof(reward_rules -> 'equalWin') = 'object'
    and jsonb_typeof(reward_rules -> 'weakerWin') = 'object'
    and jsonb_typeof(reward_rules -> 'draw') = 'object'
    and jsonb_typeof(reward_rules -> 'loss') = 'object'
    and reward_rules -> 'strongerWin' ?& array['coins', 'stars', 'tokens']
    and reward_rules -> 'equalWin' ?& array['coins', 'stars', 'tokens']
    and reward_rules -> 'weakerWin' ?& array['coins', 'stars', 'tokens']
    and reward_rules -> 'draw' ?& array['coins', 'stars', 'tokens']
    and reward_rules -> 'loss' ?& array['coins', 'stars', 'tokens']
    and (reward_rules -> 'strongerWin') - array['coins', 'stars', 'tokens']::text[] = '{}'::jsonb
    and (reward_rules -> 'equalWin') - array['coins', 'stars', 'tokens']::text[] = '{}'::jsonb
    and (reward_rules -> 'weakerWin') - array['coins', 'stars', 'tokens']::text[] = '{}'::jsonb
    and (reward_rules -> 'draw') - array['coins', 'stars', 'tokens']::text[] = '{}'::jsonb
    and (reward_rules -> 'loss') - array['coins', 'stars', 'tokens']::text[] = '{}'::jsonb
    and jsonb_typeof(reward_rules -> 'strongerWin' -> 'coins') = 'number'
    and jsonb_typeof(reward_rules -> 'strongerWin' -> 'stars') = 'number'
    and jsonb_typeof(reward_rules -> 'strongerWin' -> 'tokens') = 'number'
    and jsonb_typeof(reward_rules -> 'equalWin' -> 'coins') = 'number'
    and jsonb_typeof(reward_rules -> 'equalWin' -> 'stars') = 'number'
    and jsonb_typeof(reward_rules -> 'equalWin' -> 'tokens') = 'number'
    and jsonb_typeof(reward_rules -> 'weakerWin' -> 'coins') = 'number'
    and jsonb_typeof(reward_rules -> 'weakerWin' -> 'stars') = 'number'
    and jsonb_typeof(reward_rules -> 'weakerWin' -> 'tokens') = 'number'
    and jsonb_typeof(reward_rules -> 'draw' -> 'coins') = 'number'
    and jsonb_typeof(reward_rules -> 'draw' -> 'stars') = 'number'
    and jsonb_typeof(reward_rules -> 'draw' -> 'tokens') = 'number'
    and jsonb_typeof(reward_rules -> 'loss' -> 'coins') = 'number'
    and jsonb_typeof(reward_rules -> 'loss' -> 'stars') = 'number'
    and jsonb_typeof(reward_rules -> 'loss' -> 'tokens') = 'number'
    and reward_rules -> 'strongerWin' ->> 'coins' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'strongerWin' ->> 'stars' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'strongerWin' ->> 'tokens' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'equalWin' ->> 'coins' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'equalWin' ->> 'stars' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'equalWin' ->> 'tokens' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'weakerWin' ->> 'coins' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'weakerWin' ->> 'stars' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'weakerWin' ->> 'tokens' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'draw' ->> 'coins' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'draw' ->> 'stars' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'draw' ->> 'tokens' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'loss' ->> 'coins' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'loss' ->> 'stars' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
    and reward_rules -> 'loss' ->> 'tokens' ~ '^([0-9]|[1-9][0-9]{1,14}|[1-8][0-9]{15}|9007199254740991)$'
  , false);
$$;

alter table amateur_duel_template
  add constraint amateur_duel_template_reward_rules_valid
    check (duel_reward_rules_valid(reward_rules));

alter table amateur_duel_match
  add constraint amateur_duel_match_reward_rules_valid
    check (duel_reward_rules_valid(reward_rules));
