create temporary table bonus_game_accuracy_reward_seed (
  slug text primary key,
  reward integer not null check (reward >= 0)
) on commit drop;

insert into bonus_game_accuracy_reward_seed (slug, reward)
values
  ('accuracy-moscow', 5),
  ('accuracy-istanbul', 5),
  ('accuracy-rome', 5),
  ('accuracy-paris', 5),
  ('accuracy-london', 7),
  ('accuracy-new-york', 7),
  ('accuracy-rio-de-janeiro', 7),
  ('accuracy-cape-town', 10),
  ('accuracy-dubai', 10),
  ('accuracy-mumbai', 10),
  ('accuracy-singapore', 15),
  ('accuracy-beijing', 15),
  ('accuracy-tokyo', 25);

do $$
declare
  updated_count integer;
begin
  update bonus_game game
     set reward_coins = 0,
         reward_stars = seed.reward,
         reward_experience = seed.reward,
         revision = game.revision + 1,
         updated_at = now()
    from bonus_game_accuracy_reward_seed seed
   where game.slug = seed.slug
     and game.skill_code = 'accuracy';

  get diagnostics updated_count = row_count;

  if updated_count <> 13 then
    raise exception 'Expected to update 13 accuracy bonus games, updated %', updated_count;
  end if;
end
$$;
