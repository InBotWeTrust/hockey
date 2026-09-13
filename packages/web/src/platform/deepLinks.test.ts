import { describe, expect, it } from 'vitest';
import { resolveInternalDestination } from './deepLinks.js';

describe('resolveInternalDestination', () => {
  it.each([
    '/',
    '/?view=daily',
    '/?view=training',
    '/?view=hub',
    '/?view=amateur&section=tournaments',
    '/?view=amateur&section=tournaments&tournament=11111111-1111-4111-8111-111111111111&tab=schedule',
    '/chat/11111111-1111-4111-8111-111111111111',
    '/bonus-games',
    '/achievements',
    '/duel/beginner-goalie',
    '/admin',
  ])('accepts the internal destination %s', (destination) => {
    expect(resolveInternalDestination(destination)).toBe(destination);
  });

  it.each([
    'https://evil.example/chat/11111111-1111-4111-8111-111111111111',
    '//evil.example/path',
    '/%68%74%74%70%73%3A%2F%2Fevil.example',
    '/unknown',
    '/chat/not-a-uuid',
    '/?view=admin',
    '/?view=daily&redirect=https://evil.example',
    '/bonus-games\u0000',
    `/${'a'.repeat(2048)}`,
  ])('rejects the unsafe destination %s', (destination) => {
    expect(resolveInternalDestination(destination)).toBe('/');
  });
});
