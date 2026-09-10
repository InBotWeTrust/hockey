import type { Pool } from 'pg';

export async function validateOfficialAccount(pool: Pool, userId: string): Promise<void> {
  const result = await pool.query<{ account_kind: string }>(
    `select account_kind from users where id = $1 limit 1`,
    [userId],
  );
  if (result.rows[0]?.account_kind !== 'official') {
    throw new Error('SYSTEM_USER_ID must reference a user with account_kind=official');
  }

  await pool.query(
    `insert into official_dialog_state (chat_id, status, updated_at)
     select c.id, 'open', latest_message.created_at
       from chats c
       join chat_members official_member
         on official_member.chat_id = c.id and official_member.user_id = $1
       join lateral (
         select created_at
           from messages
          where chat_id = c.id and is_deleted = false
          order by created_at desc
          limit 1
       ) latest_message on true
      where c.type = 'direct'
        and c.is_active = true
     on conflict (chat_id) do nothing`,
    [userId],
  );
}
