import type { Pool } from 'pg';
import type { ChatRow } from './types.js';

export interface SeedSystemChannelOpts {
  name: string;
  createdBy: string; // UUID of the system/admin user
}

export interface SeedSystemChannelResult {
  chat: ChatRow;
  created: boolean; // false when an existing channel with the same name was reused
}

export async function seedSystemChannel(
  pool: Pool,
  opts: SeedSystemChannelOpts,
): Promise<SeedSystemChannelResult> {
  const name = opts.name.trim();
  if (name.length === 0) {
    throw new Error('seedSystemChannel: name must be non-empty');
  }

  const existing = await pool.query<ChatRow>(
    `select * from chats where type = 'system' and name = $1 and is_active = true limit 1`,
    [name],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return { chat: existing.rows[0]!, created: false };
  }

  const inserted = await pool.query<ChatRow>(
    `insert into chats (type, name, created_by) values ('system', $1, $2) returning *`,
    [name, opts.createdBy],
  );
  return { chat: inserted.rows[0]!, created: true };
}
