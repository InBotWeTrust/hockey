alter table training_session
  add column shots_limit int;

update training_session
   set shots_limit = 500
 where shots_limit is null;

alter table training_session
  alter column shots_limit set not null,
  alter column shots_limit set default 500,
  add constraint training_session_shots_limit_check check (shots_limit > 0);
