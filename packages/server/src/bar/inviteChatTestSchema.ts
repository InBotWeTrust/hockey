import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
/** Real chat migrations for isolated bar-service schemas, never the public schema. */
export async function installBarInviteSchema(pool: Pool) {
  for (const file of ['222_bar_games.sql', '004_chat.sql', '028_chat_message_metadata.sql', '239_bar_chat_invites.sql']) {
    await pool.query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
}
