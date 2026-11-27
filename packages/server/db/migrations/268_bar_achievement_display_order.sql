-- Club membership and character introductions lead the bar list.
-- Preserve the relative order of all remaining tasks.
-- Move outside the occupied range before swapping unique sort positions.
update achievements
set sort_order = -sort_order
where category = 'bar';

with ordered as (
  select id,
    31000 + row_number() over (
      order by case
        when id = 'bar-54-social' then 0
        when id in ('bar-45-social','bar-46-social','bar-47-social','bar-48-social','bar-49-social',
                    'bar-50-social','bar-51-social','bar-52-social','bar-53-social') then 1
        else 2
      end, -sort_order, id
    ) - 1 as display_order
  from achievements
  where category = 'bar'
)
update achievements achievement
set sort_order = ordered.display_order
from ordered
where achievement.id = ordered.id;
