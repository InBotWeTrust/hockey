import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect, it} from 'vitest';
import {barInterior, barParts, barStreet, type StreetStory} from './barArtwork.js';
import type {CityTimeOfDay} from '../city/lighting.js';

it('has all versioned current backgrounds, outcomes, decorations and staff room on disk', () => {
  const phases: CityTimeOfDay[] = ['morning', 'day', 'sunset', 'night'];
  const stories: StreetStory[] = ['street', 'player-win', 'player-loss', 'oleg-blocked'];
  const paths = [
    ...phases.flatMap(phase => [...barParts.map(part => barInterior(part, phase)), ...stories.map(story => barStreet(story, phase))]),
    '/bar/city-v3/staff-room-v1.webp',
  ];
  expect(new Set(paths).size).toBe(29);
  for (const path of paths) expect(existsSync(resolve('public', path.slice(1))), path).toBe(true);
});
