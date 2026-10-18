-- Strict consecutive goals apply to new bonus attempts only. Duel and saved attempt rules stay intact.
update bonus_game
set qualification_rules=jsonb_set(qualification_rules,'{breakOnMiss}','true'::jsonb),
    revision=revision+1, updated_at=now()
where skill_code='rhythm';
