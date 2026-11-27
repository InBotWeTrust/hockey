import { describe, expect, it } from 'vitest';
import { createBarPreviewSource } from './barPreviewSource.js';
describe('local reward source', () => {
  it('issues a reward once, advances the stage and never calls fetch', async () => {
    const source = createBarPreviewSource('amateur', true);
    const before = await source.fetch();
    const first = before.achievements.find((x) => x.isClaimable)!;
    const result = await source.claim(first.id);
    expect(result.rewards.stars).toBe(first.rewardStars);
    expect(result.stage?.opened).toBe(2);
    await expect(source.claim(first.id)).rejects.toThrow('unavailable');
    expect((await source.fetch()).achievements.find((x) => x.id === first.id)?.stage?.current).toBe(
      2,
    );
  });
  it('keeps role and reset data independent', async () => {
    const beginner = createBarPreviewSource('beginner', true);
    const locked = (await beginner.fetch()).achievements.find((x) => x.accessRequirement)!;
    await expect(beginner.claim(locked.id)).rejects.toThrow();
    const fresh = await createBarPreviewSource('amateur').fetch();
    expect(fresh.achievements).toHaveLength(95);
    expect(fresh.unclaimedCount).toBe(0);
  });
});
