-- Use recognizable geographic region names without changing stable game identities.
update bonus_game
set title = case slug when 'rhythm-raleigh' then 'Северная Каролина' else 'Миннесота' end,
    preview_title = case slug when 'rhythm-raleigh' then 'Северная Каролина' else 'Миннесота' end,
    preview_revision = preview_revision + 1,
    revision = revision + 1,
    updated_at = now()
where skill_code = 'rhythm' and slug in ('rhythm-raleigh', 'rhythm-saint-paul');

update arena_theme
set title = case slug when 'rhythm-city-raleigh' then 'Северная Каролина' else 'Миннесота' end
where slug in ('rhythm-city-raleigh', 'rhythm-city-saint-paul');
