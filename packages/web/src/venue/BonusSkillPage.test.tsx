import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BonusSkillPage } from './BonusSkillPage.js';
vi.mock('../screens/BonusGamesScreen.js', () => ({
  BonusGamesScreen: ({ embeddedSkill }: { embeddedSkill: string }) => <p>{embeddedSkill}</p>,
}));
it('passes a separate category to each embedded catalog', () => {
  render(
    <>
      <BonusSkillPage skill="speed" active />
      <BonusSkillPage skill="accuracy" active />
    </>,
  );
  expect(screen.getByText('speed')).toBeVisible();
  expect(screen.getByText('accuracy')).toBeVisible();
});
