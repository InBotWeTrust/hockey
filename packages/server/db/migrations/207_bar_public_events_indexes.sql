-- hockey:migration-mode non-transactional
-- Public journal reads saved results only. Concurrent indexes preserve gameplay writes.
create index concurrently if not exists bar_public_player_name_idx on users(lower(btrim(display_name)));
-- hockey:migration-statement
create index concurrently if not exists bar_public_fights_recent_idx on bar_oleg_fights(ended_at desc,id desc)
 where status='resolved' and outcome in ('win','loss','draw');
-- hockey:migration-statement
create index concurrently if not exists bar_public_fights_player_idx on bar_oleg_fights(user_id,ended_at desc,id desc)
 where status='resolved' and outcome in ('win','loss','draw');
-- hockey:migration-statement
create index concurrently if not exists bar_public_cards_recent_idx on bar_computer_card_history(ended_at desc,id desc);
-- hockey:migration-statement
create index concurrently if not exists bar_public_cards_player_idx on bar_computer_card_history(user_id,ended_at desc,id desc);
-- hockey:migration-statement
create index concurrently if not exists bar_public_cards_character_idx on bar_computer_card_history(character_id,ended_at desc,id desc);
