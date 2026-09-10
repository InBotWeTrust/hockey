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

create function duel_reward_amount_valid(amount jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(amount) = 'object'
    and amount ?& array['coins', 'stars', 'tokens']
    and amount - array['coins', 'stars', 'tokens']::text[] = '{}'::jsonb
    and case when jsonb_typeof(amount -> 'coins') = 'number'
      then (amount ->> 'coins')::numeric between 0 and 9007199254740991
        and (amount ->> 'coins')::numeric = trunc((amount ->> 'coins')::numeric)
      else false end
    and case when jsonb_typeof(amount -> 'stars') = 'number'
      then (amount ->> 'stars')::numeric between 0 and 9007199254740991
        and (amount ->> 'stars')::numeric = trunc((amount ->> 'stars')::numeric)
      else false end
    and case when jsonb_typeof(amount -> 'tokens') = 'number'
      then (amount ->> 'tokens')::numeric between 0 and 9007199254740991
        and (amount ->> 'tokens')::numeric = trunc((amount ->> 'tokens')::numeric)
      else false end
  , false);
$$;

create function duel_reward_rules_valid(reward_rules jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(reward_rules) = 'object'
    and reward_rules ?& array['equalExperienceTolerancePercent', 'strongerWin', 'equalWin', 'weakerWin', 'draw', 'loss']
    and reward_rules - array['equalExperienceTolerancePercent', 'strongerWin', 'equalWin', 'weakerWin', 'draw', 'loss']::text[] = '{}'::jsonb
    and case when jsonb_typeof(reward_rules -> 'equalExperienceTolerancePercent') = 'number'
      then (reward_rules ->> 'equalExperienceTolerancePercent')::numeric between 0 and 100
        and (reward_rules ->> 'equalExperienceTolerancePercent')::numeric = trunc((reward_rules ->> 'equalExperienceTolerancePercent')::numeric)
      else false end
    and duel_reward_amount_valid(reward_rules -> 'strongerWin')
    and duel_reward_amount_valid(reward_rules -> 'equalWin')
    and duel_reward_amount_valid(reward_rules -> 'weakerWin')
    and duel_reward_amount_valid(reward_rules -> 'draw')
    and duel_reward_amount_valid(reward_rules -> 'loss')
  , false);
$$;

alter table amateur_duel_template
  add constraint amateur_duel_template_reward_rules_valid
    check (duel_reward_rules_valid(reward_rules));

alter table amateur_duel_match
  add constraint amateur_duel_match_reward_rules_valid
    check (duel_reward_rules_valid(reward_rules));
