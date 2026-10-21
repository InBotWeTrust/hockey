ALTER TABLE bar_staff_room_state
 ADD COLUMN IF NOT EXISTS presence_mode text CHECK(presence_mode IN ('seated','empty')),
 ADD COLUMN IF NOT EXISTS presence_until timestamptz,
 ADD COLUMN IF NOT EXISTS absent_until timestamptz,
 ADD COLUMN IF NOT EXISTS meeting jsonb,
 ADD COLUMN IF NOT EXISTS successful_meetings integer NOT NULL DEFAULT 0 CHECK(successful_meetings>=0);
ALTER TABLE bar_staff_room_entries
 ADD COLUMN IF NOT EXISTS empty_since timestamptz,
 ADD COLUMN IF NOT EXISTS escorted_at timestamptz;
