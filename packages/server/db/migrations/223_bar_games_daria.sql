-- Preserve existing Maria darts matches while allowing new Daria matches.
alter table bar_game_matches drop constraint if exists bar_game_matches_character_check;
alter table bar_game_matches add constraint bar_game_matches_character_check
  check (character in ('maria', 'daria', 'veronika', 'arsenich'));
