create table bar_physical_incidents (
 user_id uuid not null references users(id) on delete cascade,
 event_id uuid not null,
 character_id text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,event_id)
);
insert into bar_oleg_phrases(id,kind,category,content) values
 ('touch-woman-1','intervention','sexual','Руки убрал. Она сюда отдыхать пришла.'),
 ('touch-woman-2','intervention','sexual','Не трогай её. Здесь так не делают.'),
 ('touch-man-1','intervention','insult','Руки убрал. Не провоцируй людей.'),
 ('touch-man-2','intervention','insult','Хватит тыкать в человека. Угомонись.'),
 ('touch-oleg-1','intervention','any','Руки убрал. Ещё раз полезешь, выйдем на улицу.'),
 ('touch-oleg-2','intervention','any','Ты чего толкаешься? Не надо меня проверять.');
