create index if not exists users_experience_rating_idx
  on users (experience desc, lifetime_goals_total desc, id asc);
