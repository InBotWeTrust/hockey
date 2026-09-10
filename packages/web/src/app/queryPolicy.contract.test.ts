import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('user data query policy', () => {
  it('does not poll achievements or weekly progress from the global navigation', () => {
    const bottomNav = source('../components/BottomNav.tsx');

    expect(bottomNav).not.toMatch(
      /queryKey: \['weekly-challenge', 'nav'\][\s\S]{0,180}refetchInterval/,
    );
    expect(bottomNav).not.toMatch(
      /queryKey: achievementKeys\.all[\s\S]{0,180}refetchInterval/,
    );
  });

  it('does not refetch the weekly catalog merely because the page regained focus', () => {
    const weeklyScreen = source('../screens/WeeklyChallengeScreen.tsx');

    expect(weeklyScreen).not.toContain('refetchInterval: 30_000');
    expect(weeklyScreen).not.toContain('refetchOnWindowFocus: true');
  });

  it('shares the achievements response between navigation and the sections page', () => {
    const sections = source('../screens/SectionsScreen.tsx');

    expect(sections).toContain('queryKey: achievementKeys.all');
    expect(sections).not.toContain("queryKey: ['achievements', 'section']");
  });

  it('shares the current weekly challenge between navigation and the sections page', () => {
    const bottomNav = source('../components/BottomNav.tsx');
    const sections = source('../screens/SectionsScreen.tsx');

    expect(bottomNav).toContain('queryKey: weeklyChallengeKeys.current');
    expect(sections).toContain('queryKey: weeklyChallengeKeys.current');
    expect(bottomNav).not.toContain("queryKey: ['weekly-challenge', 'nav']");
    expect(sections).not.toContain("queryKey: ['weekly-challenge', 'section']");
  });

  it('refreshes dependent balances and history only after an inventory purchase', () => {
    const inventory = source('../screens/InventoryScreen.tsx');

    expect(inventory).toContain(
      "queryClient.invalidateQueries({ queryKey: ['inventory', 'transactions'] })",
    );
    expect(inventory).toContain('updateCachedProfileBalances(queryClient');
  });

  it('refreshes balances only after a weekly reward is claimed', () => {
    const weekly = source('../screens/WeeklyChallengeScreen.tsx');

    expect(weekly).toContain("queryClient.invalidateQueries({ queryKey: ['profile'] })");
    expect(weekly).toContain("queryClient.invalidateQueries({ queryKey: ['inventory'] })");
  });

  it('refreshes the shared balance after buying a bonus game', () => {
    const bonusGames = source('../screens/BonusGamesScreen.tsx');

    expect(bonusGames).toContain(
      "queryClient.invalidateQueries({ queryKey: ['inventory'] })",
    );
  });
});
