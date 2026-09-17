alter table media_objects
  drop constraint if exists media_objects_purpose_check,
  add constraint media_objects_purpose_check
    check (purpose in (
      'chat_attachment',
      'profile_avatar',
      'chat_avatar',
      'bonus_game_media',
      'onboarding_image',
      'tournament_artwork'
    ));
