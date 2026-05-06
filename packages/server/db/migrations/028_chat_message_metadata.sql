-- Structured metadata for system-like chat messages, e.g. duel invitation actions.

alter table messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;
