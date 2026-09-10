alter table weekly_challenges
  add column reward_tokens integer not null default 5 check (reward_tokens >= 0);

alter table weekly_challenge_reward_claims
  add column tokens integer not null default 0 check (tokens >= 0);

-- Existing configured rewards remain unchanged. Only unfinished automatic
-- challenges with the old all-zero defaults receive the recommended tokens.
update weekly_challenges
   set reward_tokens = case
     when is_automatic
      and end_at > now()
      and reward_coins = 0
      and reward_stars = 0
      and reward_experience = 0 then 5
     else 0
   end;
