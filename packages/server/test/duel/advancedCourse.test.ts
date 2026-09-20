import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADVANCED_TRAINING_EXERCISES,
  buildAdvancedTrainingCatalog,
  resolveAdvancedTrainingAccess,
} from '../../src/duel/training/advancedCourse.js';

describe('advanced training catalog', () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])('requires amateur=%s and beginner=%s', (amateur, beginner, unlocked) => {
    expect(resolveAdvancedTrainingAccess(amateur, beginner)).toEqual({
      amateur_completed: amateur,
      beginner_training_completed: beginner,
      unlocked,
    });
  });

  it('shows eight sequential cards and conceals the bonus exercise', () => {
    const catalog = buildAdvancedTrainingCatalog(new Set(), true);

    expect(catalog).toHaveLength(8);
    expect(catalog.map(({ state }) => state)).toEqual([
      'available',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(catalog[7]).toMatchObject({
      title: 'Бонусное упражнение',
      description: null,
      skill: null,
      goal: null,
    });
  });

  it('keeps completions replayable and reveals the bonus after seven completions', () => {
    const completed = new Set(ADVANCED_TRAINING_EXERCISES.slice(0, 7).map(({ key }) => key));
    const catalog = buildAdvancedTrainingCatalog(completed, true);

    expect(catalog.slice(0, 7).every(({ state }) => state === 'completed')).toBe(true);
    expect(catalog[7]).toMatchObject({
      title: 'Сброс ритма',
      state: 'available',
      description: expect.any(String),
      skill: 'Ритм',
      goal: '7 из 10 моментов',
    });
  });

  it('locks every exercise when course access is closed', () => {
    expect(buildAdvancedTrainingCatalog(new Set(), false).every(({ state }) => state === 'locked')).toBe(true);
  });
});

describe('advanced training migration', () => {
  it('provides the required admin metadata for its game setting', async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, '../../db/migrations/147_advanced_training.sql'),
      'utf8',
    );

    expect(sql).toContain('insert into game_settings (key, value, label, description)');
    expect(sql).toContain("'Продвинутое обучение'");
  });
});
