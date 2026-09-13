-- The legacy flat star bonus duplicated the new achievement progression.
-- Keep already-created match snapshots immutable, but stop promising it in new duels.
update amateur_duel_template
   set win_star_reward = 0,
       updated_at = now()
 where win_star_reward <> 0;
