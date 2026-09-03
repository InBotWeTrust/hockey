create index if not exists tournament_fixture_series_fixture_number_idx
  on tournament_fixture (series_id, fixture_number)
  where series_id is not null;
