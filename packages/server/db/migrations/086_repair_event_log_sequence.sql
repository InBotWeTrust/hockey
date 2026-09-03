-- Keep event_log inserts working after restoring rows with explicit ids.
-- A restored table can contain ids above the sequence value, making the next
-- ordinary insert collide with an existing primary key.
--
-- Inserts take a ROW EXCLUSIVE table lock, so this prevents a live server from
-- inserting between max(id) and setval(). Calling nextval() while the table is
-- locked also guarantees that an already-ahead sequence is never moved back.
lock table event_log in share row exclusive mode;

select setval(
  pg_get_serial_sequence('event_log', 'id'),
  greatest(
    coalesce(max(id), 0),
    nextval(pg_get_serial_sequence('event_log', 'id'))
  ),
  true
)
from event_log;
