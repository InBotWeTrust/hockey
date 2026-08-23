import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BONUS_GAME_ASSETS, BONUS_GAME_SECTION_ARTWORK } from './bonusGameAssets';

describe('bonus game runtime assets', () => {
  it('declares all approved bonus asset paths', () => {
    expect(Object.keys(BONUS_GAME_ASSETS)).toEqual([
      'beach',
      'ski-resort',
      'cyberpunk-yard',
      'abandoned-waterpark',
      'pirate-bay',
      'north-pole',
      'desert',
      'volcanic-ice',
      'castle',
      'space',
    ]);
    expect(BONUS_GAME_SECTION_ARTWORK).toBe('/bonus-games/section-card.webp');

    const runtimePaths = [
      BONUS_GAME_SECTION_ARTWORK,
      ...Object.values(BONUS_GAME_ASSETS).flatMap((entry) => [
        entry.arena,
        entry.goalkeeperReady,
        entry.goalkeeperSave,
      ]),
    ];

    expect(runtimePaths).toHaveLength(31);
    for (const runtimePath of runtimePaths) {
      expect(existsSync(path.resolve('public', runtimePath.slice(1)))).toBe(true);
    }
  });
});
