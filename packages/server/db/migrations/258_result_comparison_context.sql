-- Preserve the actual conditions of future sessions; do not guess historical venues.
alter table day_pool add column result_context jsonb;
alter table training_session add column result_context jsonb;
