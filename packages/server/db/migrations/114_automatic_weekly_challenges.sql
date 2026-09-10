create table weekly_challenge_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into weekly_challenge_settings (id, enabled)
values (true, true)
on conflict (id) do nothing;

alter table weekly_challenges
  add column visible_from timestamptz,
  add column is_automatic boolean not null default false;

update weekly_challenges
set visible_from = start_at
where visible_from is null;

alter table weekly_challenges
  alter column visible_from set not null;

create function weekly_challenges_default_visible_from()
returns trigger
language plpgsql
as $$
begin
  if new.visible_from is null then
    new.visible_from := new.start_at;
  end if;
  return new;
end;
$$;

create trigger weekly_challenges_default_visible_from_trigger
before insert on weekly_challenges
for each row
execute function weekly_challenges_default_visible_from();

create unique index weekly_challenges_automatic_start_idx
  on weekly_challenges (start_at)
  where is_automatic;
