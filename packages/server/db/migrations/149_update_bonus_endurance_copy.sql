-- Keep catalogue cards and the pre-game preview on the same approved copy.
-- This is intentionally forward-only because migration 148 may already be recorded.

update bonus_game
   set description = 'Продержитесь до конца периода, забивая хотя бы 1 шайбу в каждом временном окне.',
       preview_story = 'Продержитесь до конца периода, забивая хотя бы 1 шайбу в каждом временном окне.'
 where skill_code = 'endurance';
