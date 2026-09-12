create table coin_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  coin_amount bigint not null check (coin_amount > 0),
  price_rub int not null check (price_rub > 0),
  badge_text text,
  marker text check (marker in ('hit', 'top', 'premium')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into coin_packages
  (slug, title, description, coin_amount, price_rub, badge_text, marker, sort_order)
values
  ('starter', 'Стартовый набор', 'Первое пополнение', 7450, 149, null, null, 1),
  ('player', 'Малый запас', 'Для небольших покупок', 16000, 299, 'Выгода 7%', null, 2),
  ('club', 'Игровой запас', 'Оптимальный выбор', 40000, 699, 'Выгода 14%', 'hit', 3),
  ('season', 'Большой запас', 'Для частых покупок', 90000, 1490, 'Выгода 21%', null, 4),
  ('professional', 'Клубный банк', 'Серьёзный запас', 190000, 2990, 'Выгода 27%', null, 5),
  ('major-league', 'Премиальный банк', 'Очень большой запас', 325000, 4990, 'Выгода 30%', 'top', 6),
  ('maximum', 'Максимальный банк', 'Максимальная выгода', 700000, 9990, 'Выгода 40%', 'premium', 7);
