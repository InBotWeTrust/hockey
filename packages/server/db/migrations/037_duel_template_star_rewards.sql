alter table amateur_duel_template
  add column if not exists win_star_reward integer not null default 0 check (win_star_reward >= 0);

alter table amateur_duel_template
  alter column ready_duration_ms set default 900000;

update amateur_duel_template
   set ready_duration_ms = 900000,
       updated_at = now()
 where ready_duration_ms = 300000
   and deleted_at is null;
