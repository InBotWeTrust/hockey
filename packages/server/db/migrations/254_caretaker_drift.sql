alter table daily_caretaker drop constraint daily_caretaker_kind_check;
alter table daily_caretaker add constraint daily_caretaker_kind_check check(kind in ('push','trail','piles','turn','throw','drift'));
alter table daily_caretaker add column drift_seed text, add column drift_state jsonb, add column drift_version integer;
alter table daily_caretaker_user add column drift_introduced_at timestamptz;
