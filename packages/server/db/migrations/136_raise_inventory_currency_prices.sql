-- Correct the catalogue to the approved higher-price economy. Resource amounts
-- and all existing user-owned inventory remain unchanged.
create temporary table raised_inventory_currency_price_seed (
  item_kind text not null,
  rarity text not null,
  currency_price integer not null check (currency_price > 0),
  primary key (item_kind, rarity)
) on commit drop;

insert into raised_inventory_currency_price_seed (item_kind, rarity, currency_price)
values
  ('stick', 'common', 6490),
  ('stick', 'rare', 12490),
  ('stick', 'legendary', 20990),
  ('skates', 'common', 6490),
  ('skates', 'rare', 12490),
  ('skates', 'legendary', 20990),
  ('nutrition', 'common', 7490),
  ('nutrition', 'rare', 14990),
  ('nutrition', 'legendary', 24990),
  ('recovery', 'common', 4990),
  ('recovery', 'rare', 8490),
  ('recovery', 'legendary', 12490);

do $$
declare
  matched_count integer;
begin
  select count(*)
    into matched_count
    from admin_inventory_items item
    join raised_inventory_currency_price_seed seed
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
  from raised_inventory_currency_price_seed seed
 where item.item_kind = seed.item_kind
   and item.rarity = seed.rarity
   and item.deleted_at is null;
