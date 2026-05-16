alter table amateur_duel_template
  alter column ranked_daily_limit set default 100,
  alter column ranked_same_opponent_limit set default 100;

update amateur_duel_template
   set ranked_daily_limit = 100,
       ranked_same_opponent_limit = 100,
       updated_at = now()
 where ranked_daily_limit <> 100
    or ranked_same_opponent_limit <> 100;
