alter table amateur_duel_participant
  add column if not exists experience_snapshot int not null default 0 check (experience_snapshot >= 0);

update amateur_duel_participant p
   set experience_snapshot = u.experience
  from users u
 where u.id = p.user_id
   and p.experience_snapshot = 0;
