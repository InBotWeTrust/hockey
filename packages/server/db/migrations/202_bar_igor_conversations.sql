alter table bar_conversations drop constraint bar_conversations_character_id_check;
alter table bar_conversations add constraint bar_conversations_character_id_check check (character_id in ('maria','daria','grigory','arsenich','veronika','oleg','timofey','igor'));
