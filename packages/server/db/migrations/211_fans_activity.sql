-- Additive social state. No historical game results are backfilled.
create table user_follows (
 follower_id uuid not null references users(id) on delete cascade,
 player_id uuid not null references users(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 primary key(follower_id,player_id), check(follower_id<>player_id)
);
create index user_follows_player_idx on user_follows(player_id,created_at desc,follower_id);
create index user_follows_follower_idx on user_follows(follower_id,created_at desc,player_id);
create table fan_membership_history (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references users(id) on delete cascade,
 follower_id uuid not null references users(id) on delete cascade,
 action text not null check(action in ('follow','unfollow','remove')),
 occurred_at timestamptz not null default clock_timestamp()
);
create index fan_history_player_idx on fan_membership_history(player_id,occurred_at desc,id desc);
create table fan_push_cooldown (
 follower_id uuid not null references users(id) on delete cascade,
 player_id uuid not null references users(id) on delete cascade,
 last_queued_at timestamptz not null,
 primary key(follower_id,player_id)
);
alter table user_push_preferences add column new_fans boolean not null default true;

create table social_activity (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 kind text not null check(kind in ('daily','training','initial_course','advanced_course','achievement','regular','playoff','duel','bar_fight','bar_cards')),
 occurred_at timestamptz not null,
 data jsonb not null check(jsonb_typeof(data)='object')
);
create index social_activity_time_idx on social_activity(occurred_at desc,id desc);
create table social_activity_actor (
 activity_id uuid not null references social_activity(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 primary key(activity_id,user_id)
);
create index social_activity_actor_user_idx on social_activity_actor(user_id,activity_id);
create function social_record_activity(source text,event_kind text,happened_at timestamptz,actors uuid[],snapshot jsonb)
returns uuid language plpgsql as $$
declare event_id uuid;
begin
 insert into social_activity(source_key,kind,occurred_at,data) values(source,event_kind,happened_at,snapshot)
 on conflict(source_key) do nothing returning id into event_id;
 if event_id is null then select id into event_id from social_activity where source_key=source; end if;
 insert into social_activity_actor(activity_id,user_id)
 select event_id,id from users where id=any(actors) and account_kind='player'
 on conflict do nothing;
 return event_id;
end $$;

alter table achievements drop constraint achievements_category_check;
alter table achievements add constraint achievements_category_check check(category in ('career','daily','training','duel','tournament','shop','rating','level','fans'));
insert into achievements(id,photo_url,title,description,requirement,category,availability,reward_currency,reward_stars,reward_experience,reward_tokens,sort_order)
select 'fans-'||threshold,'/achievements/fans-'||threshold||'.webp?v=20261013',title,
 'Трибуны поддерживают тебя.','Набрать '||threshold||' болельщиков одновременно.','fans','active',0,reward,reward,0,30000+ordinal
from (values (1,'Первый болельщик',5,1),(10,'Группа поддержки',10,2),(20,'Свой сектор',15,3),(50,'Всё громче',30,4),(100,'Трибуна за тебя',50,5),(500,'Любимец трибун',140,6),(1000,'Целая арена',250,7)) as stages(threshold,title,reward,ordinal);
