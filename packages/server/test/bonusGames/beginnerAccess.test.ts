import { beforeEach, expect, it, vi } from 'vitest';
import { assertBonusGameAccessibleToUser } from '../../src/bonusGames/catalog.js';
import { assertFullAmateurAccess, resolveAmateurAccess } from '../../src/profile/amateurAccess.js';

vi.mock('../../src/profile/amateurAccess.js', () => ({
  resolveAmateurAccess: vi.fn(),
  assertFullAmateurAccess: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveAmateurAccess).mockResolvedValue({ hasFullAccess: false } as never);
  vi.mocked(assertFullAmateurAccess).mockRejectedValue(new Error('amateur required'));
});
it.each(['challenge', 'endurance', 'marksmanship'])('blocks beginner launch of the first %s game', async skill => {
  const query = vi.fn(async () => ({ rows: [{ category_position: 1, skill_code: skill }] }));
  await expect(assertBonusGameAccessibleToUser({ query } as never, 'user', 'game')).rejects.toThrow('amateur required');
});
it.each(['speed', 'accuracy'])('allows the first two %s games for beginners', async skill => {
  const query = vi.fn(async () => ({ rows: [{ category_position: 2, skill_code: skill }] }));
  await expect(assertBonusGameAccessibleToUser({ query } as never, 'user', 'game')).resolves.toBeUndefined();
  expect(assertFullAmateurAccess).not.toHaveBeenCalled();
});
it('allows amateur access to every mode', async () => {
  vi.mocked(resolveAmateurAccess).mockResolvedValue({ hasFullAccess: true } as never);
  const query = vi.fn();
  await expect(assertBonusGameAccessibleToUser({ query } as never, 'user', 'game')).resolves.toBeUndefined();
  expect(query).not.toHaveBeenCalled();
});
