-- Normalize future legacy publication flags without rewriting migration history.
-- A start in the future cannot be launch evidence. Claims are stronger evidence
-- and remain untouched, as do all historical dates, tasks and participant rows.
update weekly_challenges challenge
   set is_active = false,
       launched_at = null,
       updated_at = now()
 where challenge.start_at > now()
   and (challenge.is_active or challenge.launched_at >= challenge.start_at)
   and not exists (
     select 1 from weekly_challenge_reward_claims claim
      where claim.challenge_id = challenge.id
   );
