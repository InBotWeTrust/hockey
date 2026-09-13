alter table weekly_challenges
  drop constraint if exists weekly_challenges_title_check;

alter table weekly_challenges
  add constraint weekly_challenges_title_length_check
  check (length(trim(title)) <= 120);
