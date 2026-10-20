delete from arsenich_destination_intro
where destination_key = 'training';

alter table arsenich_destination_intro
  drop constraint arsenich_destination_intro_destination_key_check;

alter table arsenich_destination_intro
  add constraint arsenich_destination_intro_destination_key_check check (destination_key in (
    'main', 'daily', 'sections', 'training-course', 'training-advanced', 'training-open',
    'tasks', 'shop', 'bonus-games', 'amateur', 'chat', 'profile-main'
  ));
