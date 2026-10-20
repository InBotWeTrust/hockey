alter table amateur_duel_participant add column fight_aid_until timestamptz;
create index amateur_duel_participant_fight_aid on amateur_duel_participant(match_id,fight_aid_until)
 where fight_aid_until is not null;
