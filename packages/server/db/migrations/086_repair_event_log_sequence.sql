-- Keep event_log inserts working after restoring rows with explicit ids.
-- A restored table can contain ids above the sequence value, making the next
-- ordinary insert collide with an existing primary key.
select setval(
  pg_get_serial_sequence('event_log', 'id'),
  coalesce(max(id), 1),
  max(id) is not null
)
from event_log;
