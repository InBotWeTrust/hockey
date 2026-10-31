-- Approved retrospective completion. Existing claims and reward balances are
-- untouched; the inbox trigger records only newly inserted achievements.
insert into user_achievements(user_id,achievement_id,completed_at,completion_context)
select p.user_id,a.id,min(l.ended_at),'{"source":"novice_archive_backfill"}'::jsonb
from period_log l join day_pool p on p.id=l.day_pool_id
cross join achievements a
where l.period_number=1 and l.closed_reason in ('quota','timeout')
  and a.id='first-period' and a.availability='active'
group by p.user_id,a.id
on conflict(user_id,achievement_id) do nothing;

insert into user_achievements(user_id,achievement_id,completed_at,completion_context)
select c.user_id,a.id,max(c.completed_at),'{"source":"novice_course_backfill"}'::jsonb
from initial_training_completion c cross join achievements a
where c.exercise_key in ('first-shot','three-positions','follow-the-goal','moving-goal','find-the-gap','pressure-window','game-pace')
  and a.id='hockey-school' and a.availability='active'
group by c.user_id,a.id having count(distinct c.exercise_key)=7
on conflict(user_id,achievement_id) do nothing;
