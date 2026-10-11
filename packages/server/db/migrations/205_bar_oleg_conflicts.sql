-- Server-owned conflict and fight state. No rewards or rating effects.
create table bar_conflicts (
 user_id uuid primary key references users(id) on delete cascade,
 day date not null,
 warnings integer not null default 0 check(warnings between 0 and 100),
 intervening boolean not null default false,
 blocked_until timestamptz,
 updated_at timestamptz not null default now()
);
create table bar_oleg_phrases (
 id text primary key,
 kind text not null check(kind in ('intervention','apology','calm','fight')),
 category text not null check(category in ('any','insult','sexual')),
 content text not null check(length(content) between 1 and 300)
);
insert into bar_oleg_phrases(id,kind,category,content) values
 ('protect-1','intervention','insult','Здесь людей не оскорбляют. Следи за словами.'),
 ('protect-2','intervention','insult','Тебе уже сделали замечание. Угомонись.'),
 ('protect-3','intervention','insult','Хватит хамить. Мы сюда отдыхать пришли.'),
 ('boundary-1','intervention','sexual','Она тебе уже ответила. Давай без этого.'),
 ('boundary-2','intervention','sexual','Она отказала. Оставь её в покое.'),
 ('boundary-3','intervention','sexual','Слышал, что она сказала? Хватит таких предложений.'),
 ('apology-1','apology','any','Ладно, проехали. Больше так не делай.'),
 ('apology-2','apology','any','Принято. Давай дальше спокойно.'),
 ('calm-1','calm','any','Вот и договорились.'),
 ('calm-2','calm','any','Хорошо. Отдыхай.'),
 ('fight-1','fight','any','Пойдём на улицу.'),
 ('fight-2','fight','any','Ну всё. Выходим.'),
 ('fight-3','fight','any','Разговор окончен. На выход.');
create table bar_oleg_fights (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references users(id) on delete cascade,
 source_turn_id uuid,
 runtime jsonb not null,
 status text not null default 'fighting' check(status in ('fighting','resolved','cancelled')),
 outcome text check(outcome in ('win','loss','draw','cancelled')),
 acknowledged boolean not null default false,
 created_at timestamptz not null default now(),
 ended_at timestamptz,
 provenance text not null default 'server' check(provenance='server'),
 unique(user_id,source_turn_id)
);
create unique index bar_oleg_one_active_idx on bar_oleg_fights(user_id) where status='fighting';
create index bar_oleg_owner_history_idx on bar_oleg_fights(user_id,created_at desc);
create table bar_oleg_fight_commands (
 fight_id uuid not null references bar_oleg_fights(id) on delete cascade,
 action_id uuid not null,
 seq integer not null,
 payload jsonb not null,
 primary key(fight_id,action_id),
 unique(fight_id,seq)
);
