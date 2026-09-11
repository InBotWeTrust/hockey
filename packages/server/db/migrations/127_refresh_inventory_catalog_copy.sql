do $$
begin
  if (
    select count(*)
      from admin_inventory_items
     where deleted_at is null
       and item_kind in ('stick', 'skates', 'nutrition', 'recovery')
       and rarity in ('common', 'rare', 'legendary')
  ) <> 12 then
    raise exception 'expected exactly 12 active inventory catalogue tiers before copy refresh';
  end if;
end
$$;

with catalogue_names(item_kind, rarity, title) as (
  values
    ('stick', 'common', 'Ультимейт Вектор'),
    ('stick', 'rare', 'Ультимейт Вектор Плюс'),
    ('stick', 'legendary', 'Ультимейт Вектор Макс'),
    ('skates', 'common', 'Ультимейт Рывок'),
    ('skates', 'rare', 'Ультимейт Рывок Плюс'),
    ('skates', 'legendary', 'Ультимейт Рывок Макс'),
    ('nutrition', 'common', 'Ультимейт Заряд'),
    ('nutrition', 'rare', 'Ультимейт Заряд Плюс'),
    ('nutrition', 'legendary', 'Ультимейт Заряд Макс'),
    ('recovery', 'common', 'Ультимейт Рестарт'),
    ('recovery', 'rare', 'Ультимейт Рестарт Плюс'),
    ('recovery', 'legendary', 'Ультимейт Рестарт Макс')
)
update admin_inventory_items item
   set title = names.title,
       description = case item.item_kind
         when 'stick' then
           'Клюшка ' || names.title || ' на ' || item.charges_per_purchase::text
             || ' бросков. Ускоряет полёт шайбы.'
         when 'skates' then
           'Коньки ' || names.title || ' на ' || item.charges_per_purchase::text
             || ' прокатов. Убирают спотыкания, пока есть ресурс.'
         when 'nutrition' then
           names.title || ' на ' || (item.charges_per_purchase / 60000)::text
             || ' минут активной игры. Помогает держать темп.'
         when 'recovery' then
           names.title || '. Сокращает текущее восстановление на '
             || item.effect_recovery_minutes::text || ' минут.'
       end,
       updated_at = now()
  from catalogue_names names
 where item.item_kind = names.item_kind
   and item.rarity = names.rarity
   and item.deleted_at is null;
