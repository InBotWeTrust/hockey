alter table admin_inventory_items
  add column if not exists rarity text not null default 'common',
  add column if not exists power_score int not null default 0,
  add column if not exists effect_recovery_delay_ms int not null default 0,
  add column if not exists effect_stumble_chance numeric(8, 4) not null default 0,
  add column if not exists effect_stumble_ms int not null default 0,
  add column if not exists effect_stumble_blocks_per_period int not null default 0;

alter table amateur_duel_template
  add column if not exists difficulty text not null default 'hard',
  add column if not exists duel_variant text not null default 'classic',
  add column if not exists ranked_enabled boolean not null default true,
  add column if not exists matchmaking_enabled boolean not null default true,
  add column if not exists challenge_ttl_ms int not null default 1800000,
  add column if not exists ready_duration_ms int not null default 300000,
  add column if not exists ready_no_show_cooldown_ms int not null default 900000,
  add column if not exists matchmaking_timeout_ms int not null default 180000,
  add column if not exists ranked_daily_limit int not null default 100,
  add column if not exists ranked_same_opponent_limit int not null default 100,
  add column if not exists power_cap int not null default 100;

alter table amateur_duel_match
  add column if not exists source text not null default 'challenge',
  add column if not exists ranked boolean not null default true,
  add column if not exists season_key text not null default to_char((now() at time zone 'Europe/Moscow'), 'YYYY-MM'),
  add column if not exists ready_expires_at timestamptz,
  add column if not exists cooldown_user_id uuid references users(id) on delete set null,
  add column if not exists cooldown_until timestamptz;

alter table amateur_duel_match
  drop constraint if exists amateur_duel_match_status_check;

update amateur_duel_match
   set status = case status
       when 'pending' then 'invited'
       when 'scheduled' then 'active'
       else status
     end
 where status in ('pending', 'scheduled');

alter table amateur_duel_match
  add constraint amateur_duel_match_status_check
  check (status in ('invited', 'ready_check', 'active', 'settled', 'cancelled', 'expired'));

alter table amateur_duel_participant
  add column if not exists ready_at timestamptz,
  add column if not exists loadout_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists inventory_report jsonb not null default '[]'::jsonb;

alter table amateur_duel_participant
  drop constraint if exists amateur_duel_participant_state_check;

update amateur_duel_participant
   set state = case
       when state = 'accepted' and exists (
         select 1 from amateur_duel_match m
          where m.id = amateur_duel_participant.match_id and m.status = 'invited'
       ) then 'loadout_pending'
       else state
     end;

alter table amateur_duel_participant
  add constraint amateur_duel_participant_state_check
  check (state in ('invited', 'loadout_pending', 'ready', 'accepted', 'period_active', 'break_active', 'completed', 'forfeit'));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'amateur_duel_rating' and column_name = 'season_key'
  ) then
    alter table amateur_duel_rating drop constraint amateur_duel_rating_pkey;
    alter table amateur_duel_rating add column season_key text not null default to_char((now() at time zone 'Europe/Moscow'), 'YYYY-MM');
    alter table amateur_duel_rating add primary key (season_key, user_id);
  end if;
end $$;

create table if not exists amateur_duel_matchmaking_ticket (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references amateur_duel_template(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'matched', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  matched_match_id uuid references amateur_duel_match(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amateur_duel_matchmaking_open_idx
  on amateur_duel_matchmaking_ticket (template_id, created_at)
  where status = 'queued';

create unique index if not exists amateur_duel_matchmaking_one_open_user_idx
  on amateur_duel_matchmaking_ticket (template_id, user_id)
  where status = 'queued';

update admin_inventory_items
   set item_kind = case
         when lower(title) like '%клюш%' then 'stick'
         when lower(title) like '%коньк%' then 'skates'
         when lower(title) like '%питан%' then 'nutrition'
         else item_kind
       end,
       duel_period_cost = case
         when lower(title) like '%клюш%' then 1
         when lower(title) like '%коньк%' then 1
         when lower(title) like '%питан%' then 1
         else duel_period_cost
       end,
       charges_per_purchase = case
         when lower(title) like '%клюш%' or lower(title) like '%коньк%' or lower(title) like '%питан%'
           then 10
         else charges_per_purchase
       end,
       power_score = case
         when lower(title) like '%клюш%' then 35
         when lower(title) like '%коньк%' then 35
         when lower(title) like '%питан%' then 20
         else power_score
       end;
