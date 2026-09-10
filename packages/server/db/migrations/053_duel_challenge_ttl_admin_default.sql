alter table amateur_duel_template
  alter column challenge_ttl_ms set default 900000;

update amateur_duel_template
   set challenge_ttl_ms = ready_duration_ms,
       updated_at = now()
 where deleted_at is null
   and challenge_ttl_ms = 1800000;
