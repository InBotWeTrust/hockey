-- Preserve purchases, card expiry and daily usage while changing the current allowance.
update bar_visitor_settings
set settings = settings || '{"cardMessages":50,"freeGames":2,"cardGames":5}'::jsonb,
    revision = revision + 1,
    updated_at = now()
where id = 1;
