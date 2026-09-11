do $$
begin
  if (
    select count(*)
    from admin_inventory_items
    where deleted_at is null
      and item_kind in ('stick', 'skates', 'nutrition', 'recovery')
      and rarity in ('common', 'rare', 'legendary')
  ) <> 12 then
    raise exception 'expected exactly 12 active inventory catalogue tiers before dev sync';
  end if;
end
$$;

update admin_inventory_items
set title = seed.title,
    description = seed.description,
    currency_price = seed.currency_price,
    charges_per_purchase = seed.charges_per_purchase,
    updated_at = now()
from (
  values
    ('stick', 'common', 'Ультимейт Ван 1', 'Комплект клюшек Ультимейт Ван на 1800 бросков. Ускоряет полёт шайбы.', 3750, 1800),
    ('stick', 'rare', 'Ультимейт Ван 2', 'Комплект клюшек Ультимейт Ван на 3800 бросков. Ускоряет полёт шайбы.', 7500, 3800),
    ('stick', 'legendary', 'Ультимейт Ван 3', 'Комплект клюшек Ультимейт Ван на 6700 бросков. Ускоряет полёт шайбы.', 12500, 6700),
    ('skates', 'common', 'Старт', 'Бронзовые коньки на 7200 прокатов. Убирают спотыкания, пока есть ресурс.', 3750, 7200),
    ('skates', 'rare', 'Коньки для теста', 'Серебряные коньки на 15200 прокатов. Убирают спотыкания, пока есть ресурс.', 7500, 15200),
    ('skates', 'legendary', 'Профи', 'Золотые коньки на 26800 прокатов. Убирают спотыкания, пока есть ресурс.', 12500, 26800),
    ('nutrition', 'common', 'Изотоник Тест', 'Питание на 75 минут активной игры. Помогает держать темп.', 3750, 4500000),
    ('nutrition', 'rare', 'Энерго-заряд', 'Питание на 160 минут активной игры. Помогает держать темп.', 7500, 9600000),
    ('nutrition', 'legendary', 'Энерго-комплекс', 'Питание на 280 минут активной игры. Помогает держать темп.', 12500, 16800000),
    ('recovery', 'common', 'Малый набор для восстановления', 'Сокращает текущее восстановление на 15 минут.', 2950, 1),
    ('recovery', 'rare', 'Набор для восстановления', 'Сокращает текущее восстановление на 30 минут.', 4950, 1),
    ('recovery', 'legendary', 'Большой набор для восстановления', 'Полностью снимает часовое восстановление.', 7450, 1)
) as seed(item_kind, rarity, title, description, currency_price, charges_per_purchase)
where admin_inventory_items.item_kind = seed.item_kind
  and admin_inventory_items.rarity = seed.rarity
  and admin_inventory_items.deleted_at is null;
