alter table amateur_duel_fight add column runtime_version integer not null default 0;
alter table amateur_duel_fight add column runtime_owner uuid;
alter table amateur_duel_fight add column runtime_generation bigint not null default 0;
alter table amateur_duel_fight add column runtime_revision_limit bigint not null default 0;
alter table amateur_duel_fight add column runtime_lease_until timestamptz;
alter table amateur_duel_fight add column call_refunded boolean not null default false;
alter table amateur_duel_fight_presence add column protocol_version integer not null default 2;
create index amateur_duel_fight_runtime_active on amateur_duel_fight(runtime_lease_until) where runtime_version=1 and status in ('starting','fighting','sudden_death');
insert into game_settings(key,value,label,description) values('duels.fights.runtime.enabled','false'::jsonb,'Быстрые комнаты драк','Только для новых боёв с двумя совместимыми клиентами') on conflict do nothing;
