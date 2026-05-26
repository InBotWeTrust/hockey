import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { findOrCreateTelegramUser, type AppUser, type UserRole } from './users.js';
import { AppError } from '../plugins/errors.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeDevAccessCode(input: string): string {
  return input
    .replace(/[\s-]+/g, '')
    .trim()
    .toUpperCase();
}

export function hashDevAccessCode(input: string): string {
  return createHash('sha256').update(normalizeDevAccessCode(input), 'utf8').digest('hex');
}

export function generateDevAccessCode(): string {
  const bytes = randomBytes(10);
  let raw = '';
  for (const byte of bytes) {
    raw += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

const createInputSchema = z.object({
  label: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  telegramProviderUid: z.string().trim().min(1).optional(),
  role: z.enum(['player', 'admin']).default('player'),
  code: z.string().trim().min(6).optional(),
});

export type CreateDevAccessCodeInput = z.input<typeof createInputSchema>;

export async function createDevAccessCode(
  pool: Pool,
  rawInput: CreateDevAccessCodeInput,
): Promise<{ code: string; id: string }> {
  const input = createInputSchema.parse(rawInput);
  const code = input.code ?? generateDevAccessCode();
  const { rows } = await pool.query<{ id: string }>(
    `insert into dev_access_codes (
       id, code_hash, label, telegram_provider_uid, display_name, role
     ) values ($1, $2, $3, $4, $5, $6)
     on conflict (code_hash) do update
       set label = excluded.label,
           telegram_provider_uid = excluded.telegram_provider_uid,
           display_name = excluded.display_name,
           role = excluded.role,
           revoked_at = null
     returning id`,
    [
      randomUUID(),
      hashDevAccessCode(code),
      input.label,
      input.telegramProviderUid ?? null,
      input.displayName,
      input.role,
    ],
  );
  return { code, id: rows[0]!.id };
}

export async function authenticateDevAccessCode(
  pool: Pool,
  input: { code: string; timezone?: string },
): Promise<AppUser> {
  const codeHash = hashDevAccessCode(input.code);
  const { rows } = await pool.query<{
    id: string;
    telegram_provider_uid: string | null;
    display_name: string;
    role: UserRole;
    user_id: string | null;
  }>(
    `select id, telegram_provider_uid, display_name, role, user_id
       from dev_access_codes
      where code_hash = $1
        and revoked_at is null`,
    [codeHash],
  );
  const access = rows[0];
  if (!access) {
    throw new AppError('unauthenticated', 'invalid dev access code', 401);
  }

  const providerUid = access.telegram_provider_uid ?? `dev-code:${access.id}`;
  const user = await findOrCreateTelegramUser(pool, {
    providerUid,
    displayName: access.display_name,
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  });

  if (access.role === 'admin' && user.role !== 'admin') {
    await pool.query(`update users set role = 'admin' where id = $1`, [user.id]);
    user.role = 'admin';
  }

  await pool.query(
    `update dev_access_codes
        set user_id = $2,
            uses = uses + 1,
            last_used_at = now()
      where id = $1`,
    [access.id, user.id],
  );

  return user;
}
