-- Keep existing bar achievement progress and rewards unchanged.
update achievements
set description = 'Три точных броска — 180 очков за ход.'
where id in ('bar-3-character', 'bar-3-online');
