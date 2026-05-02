create index shot_session_user_mode_created_idx
  on shot_session (user_id, mode, created_at desc);
