import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect, it} from 'vitest';
import {barInterior, barFloor, barParts, barStreet, type StreetStory} from './barArtwork.js';
import type {CityTimeOfDay} from '../city/lighting.js';

it('has all versioned current backgrounds, outcomes, decorations and staff room on disk', () => {
  const phases: CityTimeOfDay[] = ['morning', 'day', 'sunset', 'night'];
  const stories: StreetStory[] = ['street', 'player-win', 'player-loss', 'oleg-blocked'];
  const paths = [
    ...phases.flatMap(phase => [barFloor(phase), ...barParts.map(part => barInterior(part, phase)), ...stories.map(story => barStreet(story, phase))]),
    '/bar/city-v3/director-office-portrait-v2.webp',
    '/bar/city-v3/director-office-wide-v1.webp',
  ];
  expect(new Set(paths).size).toBe(34);
  for (const path of paths) expect(existsSync(resolve('public', path.slice(1))), path).toBe(true);
});

it('versions all corrected wall lighting variants while retaining approved day and floor assets', () => {
  expect(barInterior('west', 'day')).toBe('/bar/city-v4/west-day-v3.webp');
  expect(barInterior('middle', 'day')).toBe('/bar/city-v4/middle-day-v3.webp');
  expect(barInterior('east', 'day')).toBe('/bar/city-v4/east-day-v3.webp');
  for (const phase of ['morning', 'sunset', 'night'] as const) {
    for (const part of barParts) expect(barInterior(part, phase)).toBe(`/bar/city-v4/${part}-${phase}-v2.webp`);
    expect(barFloor(phase)).toBe(`/bar/city-v4/master-${phase}-v1.webp`);
  }
  expect(barFloor('day')).toBe('/bar/city-v4/day-master-v1.webp');
});
