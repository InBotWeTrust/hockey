UPDATE achievement_stages
SET requirement = CASE achievement_id
  WHEN 'training-before-battle' THEN
    'После тренировки выиграть ' || (target ->> 'wins') || ' ' ||
    CASE
      WHEN (target ->> 'wins')::int = 1 THEN 'дуэль'
      WHEN (target ->> 'wins')::int BETWEEN 2 AND 4 THEN 'дуэли'
      ELSE 'дуэлей'
    END || ' подряд'
  WHEN 'dangerous-host' THEN
    'Выиграть ' || (target ->> 'wins') || ' ' ||
    CASE WHEN (target ->> 'wins')::int BETWEEN 2 AND 4 THEN 'дуэли' ELSE 'дуэлей' END ||
    ' подряд в роли хозяина'
  WHEN 'dangerous-guest' THEN
    'Выиграть ' || (target ->> 'wins') || ' ' ||
    CASE WHEN (target ->> 'wins')::int BETWEEN 2 AND 4 THEN 'дуэли' ELSE 'дуэлей' END ||
    ' подряд в роли гостя'
  WHEN 'hunter-streak' THEN
    'Выиграть ' || (target ->> 'wins') || ' дуэлей подряд'
  WHEN 'no-error-express' THEN
    'Выиграть Экспресс, допустив не больше ' || (target ->> 'maximumNonGoals') || ' ' ||
    CASE
      WHEN (target ->> 'maximumNonGoals')::int = 1 THEN 'незабитого броска'
      WHEN (target ->> 'maximumNonGoals')::int BETWEEN 2 AND 4 THEN 'незабитых бросков'
      ELSE 'незабитых бросков'
    END
  WHEN 'no-error-mix' THEN
    'Выиграть Микс, допустив не больше ' || (target ->> 'maximumNonGoals') || ' ' ||
    CASE
      WHEN (target ->> 'maximumNonGoals')::int = 1 THEN 'незабитого броска'
      ELSE 'незабитых бросков'
    END
  WHEN 'no-error-classic' THEN
    'Выиграть Классику, допустив не больше ' || (target ->> 'maximumNonGoals') || ' ' ||
    CASE
      WHEN (target ->> 'maximumNonGoals')::int = 1 THEN 'незабитого броска'
      ELSE 'незабитых бросков'
    END
  ELSE requirement
END,
updated_at = now()
WHERE achievement_id IN (
  'training-before-battle',
  'dangerous-host',
  'dangerous-guest',
  'hunter-streak',
  'no-error-express',
  'no-error-mix',
  'no-error-classic'
);
