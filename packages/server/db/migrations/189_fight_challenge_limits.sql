alter table amateur_duel_fight drop constraint amateur_duel_fight_initiator_attempt_key;
create unique index amateur_duel_fight_request on amateur_duel_fight(match_id,initiator_user_id,request_id);
alter table amateur_duel_fight add column forced boolean not null default false;
