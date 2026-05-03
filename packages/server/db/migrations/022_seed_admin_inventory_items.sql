insert into admin_inventory_items (photo_url, title, description, price_rub)
select photo_url, title, description, price_rub
  from (
    values
      (
        '/inventory/sticks.webp',
        'Клюшки',
        'Более точные и быстрые броски по воротам',
        0
      ),
      (
        '/inventory/skates.webp',
        'Коньки',
        'Управление скоростью перемещения игрока',
        0
      ),
      (
        '/inventory/nutrition.webp',
        'Спортпитание',
        'Ускоренное восстановление и меньшая усталость',
        0
      )
  ) as seed(photo_url, title, description, price_rub)
 where not exists (
   select 1
     from admin_inventory_items existing
    where lower(existing.title) = lower(seed.title)
 );
