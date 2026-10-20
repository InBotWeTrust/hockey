import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  import.meta.dirname,
  '../db/migrations/182_restore_training_hub_intro.sql',
);

describe('migration 182 restores the training hub introduction', () => {
  it('adds the fourth training destination with hub-specific copy', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain("'training'");
    expect(sql).toContain("'training-course'");
    expect(sql).toContain("'training-advanced'");
    expect(sql).toContain("'training-open'");
    expect(sql).toContain(
      'Здесь три варианта тренировки. Я рекомендую начать с упражнений новичка',
    );
    expect(sql).toContain('Начальный уровень');
    expect(sql).toContain('Продвинутый уровень');
    expect(sql).toContain('Открытой тренировке');
    expect(sql).not.toContain('На этой странице собраны три формата тренировок');
  });
});
