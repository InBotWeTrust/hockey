drop index if exists tournament_one_published_revision_idx;

create index if not exists tournament_published_revision_history_idx
  on tournament_revision (tournament_id, revision desc)
  where is_published;
