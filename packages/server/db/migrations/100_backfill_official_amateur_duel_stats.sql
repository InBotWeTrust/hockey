-- Official profile totals historically included daily and classic tournament
-- shots, but omitted every shot played through the shared amateur-duel engine.
-- That engine powers both ordinary duels and head-to-head tournament games,
-- including playoff series. Add those already recorded shots exactly once;
-- training and bonus modes remain intentionally excluded.
with amateur_duel_totals as (
  select user_id,
         count(*)::int as shots,
         count(*) filter (where server_result = 'goal')::int as goals
    from shot_session
   where mode = 'amateur_duel'
   group by user_id
)
update users player
   set lifetime_shots_total = player.lifetime_shots_total + totals.shots,
       lifetime_goals_total = player.lifetime_goals_total + totals.goals
  from amateur_duel_totals totals
 where player.id = totals.user_id;
