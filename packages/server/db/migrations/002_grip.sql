alter table users
  add column grip text not null default 'right' check (grip in ('right', 'left'));
