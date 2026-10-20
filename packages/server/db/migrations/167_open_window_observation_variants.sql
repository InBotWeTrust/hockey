alter table open_window_training_run
  drop constraint open_window_training_run_scene_variant_check;

alter table open_window_training_run
  add constraint open_window_training_run_scene_variant_check
  check (
    scene_variant between 1 and 6
    or (scene_variant = 0 and step_key in
      ('notice_frame', 'notice_motion', 'notice_independent'))
  );
