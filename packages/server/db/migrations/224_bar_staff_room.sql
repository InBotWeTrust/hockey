CREATE TABLE IF NOT EXISTS bar_staff_room_state (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 day date NOT NULL,
 warned_at timestamptz,
 fight_id uuid REFERENCES bar_oleg_fights(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS bar_staff_room_entries (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 entry_id uuid NOT NULL,
 day date NOT NULL,
 entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,entry_id)
);
