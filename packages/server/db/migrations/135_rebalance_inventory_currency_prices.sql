-- Raise recurring inventory spend without accelerating resource consumption.
-- Nutrition keeps a premium because losing it has the strongest gameplay impact.
create temporary table inventory_currency_price_seed (
  item_kind text not null,
  rarity text not null,
  currency_price integer not null check (currency_price > 0),
  primary key (item_kind, rarity)
) on commit drop;

insert into inventory_currency_price_seed (item_kind, rarity, currency_price)
values
  ('stick', 'common', 2990),
  ('stick', 'rare', 4190),
  ('stick', 'legendary', 6290),
  ('skates', 'common', 2990),
  ('skates', 'rare', 4190),
  ('skates', 'legendary', 6290),
  ('nutrition', 'common', 3490),
  ('nutrition', 'rare', 4990),
  ('nutrition', 'legendary', 7490),
  ('recovery', 'common', 990),
  ('recovery', 'rare', 1690),
  ('recovery', 'legendary', 2990);

do $$
declare
  matched_count integer;
begin
  select count(*)
    into matched_count
    from admin_inventory_items item
    join inventory_currency_price_seed seed
      on seed.item_kind = item.item_kind
     and seed.rarity = item.rarity
   where item.deleted_at is null;

  if matched_count <> 12 then
    raise exception 'Expected exactly 12 active inventory tiers, matched %', matched_count;
  end if;
end
$$;

update admin_inventory_items item
   set currency_price = seed.currency_price,
       updated_at = now()
  from inventory_currency_price_seed seed
 where item.item_kind = seed.item_kind
   and item.rarity = seed.rarity
   and item.deleted_at is null;
