import { expect, it } from 'vitest';
import { appSurface } from './appSurface.js';
import { toLocation } from './ColumnNavigation.js';
it('opens panorama and venue surfaces while containing utility and auth pages', () => {
  for (const href of ['/sections', '/bar']) expect(appSurface(toLocation(href))).toBe('panorama');
  for (const href of [
    '/daily',
    '/profile',
    '/profile/story/series-2',
    '/achievements',
    '/bonus-games',
    '/?view=training&section=open',
    '/?view=amateur&section=duels',
  ])
    expect(appSurface(toLocation(href))).toBe('venue');
  for (const href of ['/login', '/admin', '/terms', '/inventory'])
    expect(appSurface(toLocation(href))).toBe('contained');
  expect(appSurface(toLocation('/chat/a'))).toBe('chat');
});
it('keeps every active game out of the venue renderer', () => {
  for (const href of [
    '/?view=daily',
    '/?view=classic&tournament=a',
    '/?view=training&play=1',
    '/?view=training&exercise=a&play=1',
    '/?view=amateur&match=a&play=1',
    '/bonus-games/g/play',
    '/bar/games/match/a',
    '/bar/darts/a',
    '/bar/cards/computer/maria',
    '/bar/cards/maria',
  ])
    expect(appSurface(toLocation(href)), href).toBe('game');
});
