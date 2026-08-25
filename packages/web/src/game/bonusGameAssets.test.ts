import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BONUS_GAME_ASSETS, BONUS_GAME_SECTION_ARTWORK } from './bonusGameAssets';

function readWebpDimensions(filePath: string): { width: number; height: number } {
  const bytes = readFileSync(filePath);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Not a WebP file: ${filePath}`);
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === 'VP8X') {
      return {
        width: bytes.readUIntLE(dataOffset + 4, 3) + 1,
        height: bytes.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }
    if (chunkType === 'VP8 ') {
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L') {
      const bits = bytes.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  throw new Error(`Missing WebP image chunk: ${filePath}`);
}

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

  it('keeps every bonus arena on the same 1212x2000 geometry as the live game court', () => {
    for (const entry of Object.values(BONUS_GAME_ASSETS)) {
      const filePath = path.resolve('public', entry.arena.slice(1));
      expect(readWebpDimensions(filePath), entry.arena).toEqual({ width: 1212, height: 2000 });
    }
  });
});
