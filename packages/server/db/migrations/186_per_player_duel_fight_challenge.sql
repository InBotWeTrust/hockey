alter table amateur_duel_fight drop constraint amateur_duel_fight_match_id_key;
alter table amateur_duel_fight add constraint amateur_duel_fight_initiator_attempt_key unique(match_id,initiator_user_id);
create index amateur_duel_fight_latest on amateur_duel_fight(match_id,offered_at desc,id desc);
create unique index amateur_duel_fight_one_active on amateur_duel_fight(match_id)
 where status in ('offered','starting','fighting','sudden_death');
