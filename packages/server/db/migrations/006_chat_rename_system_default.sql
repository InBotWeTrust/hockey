-- Rename the default system channel: "Общий чат лиги" → "Общий чат".
-- Idempotent: only matches the previous default name; if an operator already
-- renamed via SYSTEM_CHAT_NAME this is a no-op. The seed-cli looks chats up
-- by name, so without this rename a fresh seed of "Общий чат" would create
-- a duplicate row instead of reusing the existing one.

update chats
   set name = 'Общий чат',
       updated_at = now()
 where type = 'system'
   and is_active = true
   and name = 'Общий чат лиги';
