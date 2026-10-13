-- Freeze Classic's player-speed drops in Marathon templates for new match snapshots.
alter table amateur_duel_template add column marathon_speed_stages jsonb;
do $$
declare stages jsonb;
begin
  with classic as (
    select period_speed_presets from amateur_duel_template
    where duel_kind = 'classic' and deleted_at is null
    order by is_active desc, created_at desc limit 1
  ), speeds as (
    select
      (select (p->>'shooterFrequency')::numeric from jsonb_array_elements(period_speed_presets) p where p->>'periodNumber' = '1') as first,
      (select (p->>'shooterFrequency')::numeric from jsonb_array_elements(period_speed_presets) p where p->>'periodNumber' = '2') as second,
      (select (p->>'shooterFrequency')::numeric from jsonb_array_elements(period_speed_presets) p where p->>'periodNumber' = '3') as third
    from classic
  )
  select jsonb_build_array(
    jsonb_build_object('startsAtMs', 80000, 'shooterSpeedDelta', least(0, speeds.second - speeds.first)),
    jsonb_build_object('startsAtMs', 160000, 'shooterSpeedDelta', least(0, speeds.second - speeds.first, speeds.third - speeds.first))
  ) into stages from speeds;
  if stages is null then raise exception 'Classic template is required to copy Marathon speed drops'; end if;
  -- Admin-created replacement templates inherit the same frozen balance.
  execute format('alter table amateur_duel_template alter column marathon_speed_stages set default %L::jsonb', stages::text);
  -- Existing other kinds may later be converted to Marathon by the admin PATCH.
  update amateur_duel_template set marathon_speed_stages = stages, updated_at = now()
    where marathon_speed_stages is null;
end $$;
