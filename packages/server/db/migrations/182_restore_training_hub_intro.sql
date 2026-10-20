alter table arsenich_destination_intro
  drop constraint arsenich_destination_intro_destination_key_check;

alter table arsenich_destination_intro
  add constraint arsenich_destination_intro_destination_key_check check (destination_key in (
    'main', 'daily', 'sections', 'training', 'training-course', 'training-advanced',
    'training-open', 'tasks', 'shop', 'bonus-games', 'amateur', 'chat', 'profile-main'
  ));

insert into arsenich_destination_intro (destination_key, windows) values
('training', '[{"title":"Здесь три варианта тренировки. Я рекомендую начать с упражнений новичка","body":"- «Начальный уровень» поможет поставить бросок и пройти упражнения по порядку.\n- «Продвинутый уровень» добавит более сложные игровые ситуации.\n- В «Открытой тренировке» ты сам выбираешь настройки и занимаешься в своём темпе.","ctaLabel":"Выберу"}]');
