alter table users
  add column role text not null default 'player'
    check (role in ('player', 'admin'));

update users u
   set role = 'admin'
  from auth_providers ap
 where ap.user_id = u.id
   and ap.provider = 'telegram'
   and ap.provider_uid = '432014500';

create table game_settings (
  key text primary key,
  value jsonb not null,
  label text not null,
  description text not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into game_settings (key, value, label, description)
values
  (
    'daily.shots_per_period',
    to_jsonb(30),
    'Бросков в периоде',
    'Квота бросков в одном периоде дневной игры.'
  ),
  (
    'daily.period_duration_minutes',
    to_jsonb(20),
    'Длительность периода',
    'Сколько минут длится активный период дневной игры.'
  ),
  (
    'daily.break_duration_minutes',
    to_jsonb(15),
    'Длительность перерыва',
    'Сколько минут длится перерыв между периодами.'
  ),
  (
    'daily.goalie_id',
    to_jsonb('rookie'::text),
    'Вратарь дневной игры',
    'Вратарь, против которого играется дневной режим.'
  ),
  (
    'training.shots_limit',
    to_jsonb(500),
    'Лимит тренировки',
    'Сколько бросков доступно в ежедневной тренировке.'
  ),
  (
    'training.goalie_id',
    to_jsonb('rookie'::text),
    'Вратарь тренировки',
    'Вратарь, против которого играется тренировка.'
  );
