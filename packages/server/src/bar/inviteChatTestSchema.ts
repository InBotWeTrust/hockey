import type { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
/** Real chat migrations for isolated bar-service schemas, never the public schema. */
export async function installBarInviteSchema(pool: Pool) {
  await pool.query('create extension if not exists pg_trgm');
  const extension = await pool.query<{ schema: string }>(
    `select quote_ident(n.nspname) as schema from pg_extension e
     join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm'`,
  );
  const operatorClass = `${extension.rows[0]!.schema}.gin_trgm_ops`;
  for (const file of ['222_bar_games.sql', '004_chat.sql', '028_chat_message_metadata.sql', '239_bar_chat_invites.sql']) {
    const sql = await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
    await pool.query(sql.replaceAll('gin_trgm_ops', operatorClass));
  }
}
