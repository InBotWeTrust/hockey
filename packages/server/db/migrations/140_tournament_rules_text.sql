alter table tournament
  add column if not exists rules_text text not null default '';
