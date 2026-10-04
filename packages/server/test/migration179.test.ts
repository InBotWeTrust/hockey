import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  import.meta.dirname,
  '../db/migrations/179_arsenich_destination_intros.sql',
);

describe('migration 179 Arsenich destination introductions', () => {
  it('stores one permanent view per player and destination and seeds ten enabled destinations', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toMatch(/primary key \(user_id, destination_key\)/i);
    expect(sql).toMatch(/jsonb_array_length\(windows\) between 1 and 2/i);
    expect(sql.match(/^\('\w|^\('bonus-games'|^\('profile-/gm)).toHaveLength(10);
    expect(sql).toContain("('main'");
    expect(sql).toContain('Здесь играют против других игроков');
    expect(sql).toContain('Смотреть матчи, рейтинги и результаты могут все игроки');
    expect(sql).toContain('участвовать - только любители и профессионалы');
    expect(sql).not.toContain('Ну всё, теперь играем против других');
    expect(sql).not.toContain("'profile-secondary'");
    expect(sql).not.toContain("'professional'");
  });
});
