alter table arsenich_destination_intro
  drop constraint arsenich_destination_intro_destination_key_check;

alter table arsenich_destination_intro
  add constraint arsenich_destination_intro_destination_key_check check (destination_key in (
    'main', 'daily', 'sections', 'training', 'training-course', 'training-advanced',
    'training-open', 'tasks', 'shop', 'bonus-games', 'amateur', 'chat', 'profile-main'
  ));

insert into arsenich_destination_intro (destination_key, windows) values
('training-course', '[{"title":"Я тут за деталями для Логана мимо ехал. Могу кое-что подсказать","body":"Здесь начинается обучение броскам. Упражнения открываются по порядку, и в каждом появляется новая задача.\n\n- Сначала разберёшься с основами броска.\n- Потом добавятся новые позиции, движение и вратарь.\n- Забитые шайбы идут в общую статистику игрока.","ctaLabel":"Понятно"}]'),
('training-advanced', '[{"title":"С основами разобрался. Теперь можно усложнить","body":"Здесь одного точного броска уже мало. Придётся следить за площадкой, замечать движение и выбирать подходящий момент.\n\n- У каждого упражнения своя цель.\n- Новый этап откроется после предыдущего.\n- За прохождение получишь звёзды и опыт.","ctaLabel":"Попробую"}]'),
('training-open', '[{"title":"Ну что, решил потренить?","body":"Здесь нет курса и обязательного порядка. Выбирай настройки и отрабатывай броски в своём темпе.\n\n- Настрой тренировку перед выходом на лёд.\n- Возвращайся, когда захочешь ещё поработать над броском.\n- Результаты прошлых тренировок останутся в истории.","ctaLabel":"Поехали"}]');
