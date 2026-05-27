update admin_inventory_items
   set title = case
         when item_kind = 'stick' then 'Бронзовая клюшка'
         when item_kind = 'skates' then 'Бронзовые коньки'
         when item_kind = 'nutrition' then 'Бронзовое питание'
         else title
       end,
       description = case
         when item_kind = 'stick' then 'Базовая клюшка для стабильного броска в дуэлях.'
         when item_kind = 'skates' then 'Базовая пара коньков для уверенного движения по площадке.'
         when item_kind = 'nutrition' then 'Лёгкое питание перед матчем, чтобы держать темп.'
         else description
       end,
       photo_url = case
         when item_kind = 'stick' then '/inventory/stick-bronze.webp'
         when item_kind = 'skates' then '/inventory/skates-bronze.webp'
         when item_kind = 'nutrition' then '/inventory/nutrition-bronze.webp'
         else photo_url
       end,
       rarity = 'common',
       currency_price = case
         when item_kind in ('stick', 'skates') then 120
         when item_kind = 'nutrition' then 90
         else currency_price
       end,
       charges_per_purchase = case
         when item_kind in ('stick', 'skates', 'nutrition') then 5
         else charges_per_purchase
       end,
       duel_period_cost = case
         when item_kind in ('stick', 'skates', 'nutrition') then 1
         else duel_period_cost
       end,
       power_score = case
         when item_kind in ('stick', 'skates') then 24
         when item_kind = 'nutrition' then 12
         else power_score
       end,
       updated_at = now()
 where deleted_at is null
   and (
     (item_kind = 'stick' and lower(title) in ('клюшки', 'бронзовая клюшка'))
     or (item_kind = 'skates' and lower(title) in ('коньки', 'бронзовые коньки'))
     or (item_kind = 'nutrition' and lower(title) in ('энергия', 'спортпитание', 'бронзовое питание'))
   );

insert into admin_inventory_items
  (
    photo_url,
    title,
    description,
    price_rub,
    item_kind,
    rarity,
    currency_price,
    charges_per_purchase,
    duel_period_cost,
    power_score
  )
select photo_url, title, description, 0, item_kind, rarity, currency_price, 5, 1, power_score
  from (
    values
      (
        '/inventory/stick-silver.webp',
        'Серебряная клюшка',
        'Усиленная клюшка для более опасных бросков.',
        'stick',
        'rare',
        260,
        36
      ),
      (
        '/inventory/stick-gold.webp',
        'Золотая клюшка',
        'Топовая клюшка для максимального преимущества в атаке.',
        'stick',
        'legendary',
        520,
        52
      ),
      (
        '/inventory/skates-silver.webp',
        'Серебряные коньки',
        'Более быстрые коньки для резкого выхода на бросок.',
        'skates',
        'rare',
        260,
        36
      ),
      (
        '/inventory/skates-gold.webp',
        'Золотые коньки',
        'Премиальная пара для самого высокого темпа.',
        'skates',
        'legendary',
        520,
        52
      ),
      (
        '/inventory/nutrition-silver.webp',
        'Серебряное питание',
        'Питание, которое помогает сохранить концентрацию дольше.',
        'nutrition',
        'rare',
        180,
        20
      ),
      (
        '/inventory/nutrition-gold.webp',
        'Золотое питание',
        'Лучшее питание для мощного периода без провалов.',
        'nutrition',
        'legendary',
        360,
        30
      )
  ) as seed(photo_url, title, description, item_kind, rarity, currency_price, power_score)
 where not exists (
   select 1
     from admin_inventory_items existing
    where existing.deleted_at is null
      and lower(existing.title) = lower(seed.title)
 );
