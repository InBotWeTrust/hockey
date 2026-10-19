ALTER TABLE bar_staff_room_state ADD COLUMN IF NOT EXISTS office_warnings integer NOT NULL DEFAULT 0;
ALTER TABLE bar_staff_room_state ADD COLUMN IF NOT EXISTS departed_at timestamptz;
ALTER TABLE bar_conversations DROP CONSTRAINT IF EXISTS bar_conversations_character_id_check;
ALTER TABLE bar_conversations ADD CONSTRAINT bar_conversations_character_id_check CHECK (character_id IN ('maria','daria','grigory','arsenich','veronika','oleg','timofey','igor','elina'));
ALTER TABLE bar_character_stories DROP CONSTRAINT IF EXISTS bar_character_stories_character_id_check;
ALTER TABLE bar_character_stories ADD CONSTRAINT bar_character_stories_character_id_check CHECK (character_id IN ('maria','daria','grigory','arsenich','veronika','oleg','timofey','igor','elina'));

ALTER TABLE bar_staff_room_entries ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
UPDATE bar_staff_room_entries SET last_seen_at=entered_at WHERE last_seen_at IS NULL;
ALTER TABLE bar_staff_room_entries ALTER COLUMN last_seen_at SET DEFAULT clock_timestamp();
ALTER TABLE bar_staff_room_entries ALTER COLUMN last_seen_at SET NOT NULL;
