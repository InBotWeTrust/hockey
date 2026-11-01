-- Both games share the guarded attempt lifecycle; their physics variant lives in drift_state.
alter table daily_caretaker_user add column blizzard_introduced_at timestamptz;
