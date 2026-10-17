alter table bar_game_matches drop constraint if exists bar_game_matches_kind_check;
alter table bar_game_matches add constraint bar_game_matches_kind_check check(kind in ('darts','billiards','checkers','ochko','armwrestling','battleship'));
alter table bar_game_queue drop constraint if exists bar_game_queue_kind_check;
alter table bar_game_queue add constraint bar_game_queue_kind_check check(kind in ('darts','billiards','checkers','ochko','armwrestling','battleship'));
alter table bar_game_invites drop constraint if exists bar_game_invites_kind_check;
alter table bar_game_invites add constraint bar_game_invites_kind_check check(kind in ('darts','billiards','checkers','ochko','armwrestling','battleship'));
alter table bar_game_matches drop constraint if exists bar_game_matches_character_check;
alter table bar_game_matches add constraint bar_game_matches_character_check check(character in ('maria','daria','veronika','arsenich','grigory','oleg','timofey'));
