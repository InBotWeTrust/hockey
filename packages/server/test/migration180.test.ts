import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  import.meta.dirname,
  '../db/migrations/180_arsenich_training_section_intros.sql',
);

describe('migration 180 Arsenich training section introductions', () => {
  it('extends the destination registry and seeds three training sections', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain("'training-course'");
    expect(sql).toContain("'training-advanced'");
    expect(sql).toContain("'training-open'");
    expect(sql).toContain('Я тут за деталями для Логана мимо ехал. Могу кое-что подсказать');
    expect(sql).toContain('С основами разобрался. Теперь можно усложнить');
    expect(sql).toContain('Ну что, решил потренить?');
    expect(sql).not.toContain('не только');
    expect(sql).not.toContain('—');
  });
});
