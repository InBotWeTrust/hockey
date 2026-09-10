-- Preserve actual launch independently of the current active flag.
alter table weekly_challenges add column launched_at timestamptz;

-- Legacy rows keep their existing semantics. For automatic rows, only a live
-- active flag or a recorded reward claim is evidence that launch occurred.
update weekly_challenges challenge
   set launched_at = challenge.start_at
 where challenge.is_automatic
   and (challenge.is_active or exists (
     select 1 from weekly_challenge_reward_claims claim
      where claim.challenge_id = challenge.id
   ));
