import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayViewProps } from '../game/PlayView.js';
import type * as OnboardingApi from '../api/onboarding.js';
import { startOnboardingTutorial, submitOnboardingTutorialShot } from '../api/onboarding.js';
import { TutorialShotStep } from './TutorialShotStep.js';

let playProps: PlayViewProps<unknown> | null = null;
vi.mock('../game/PlayView.js', () => ({
  TRAINING_STREET_PLAYER_OPTIONS: {
    spriteUrls: {
      left: '/sprites/street-player-left.webp',
      right: '/sprites/street-player-right.webp',
    },
  },
  PlayView: (props: PlayViewProps<unknown>) => {
    playProps = props;
    return (
      <button
        type="button"
        onClick={() => {
          props.optimisticAddShot('goal');
          void props
            .submitShot({
              shotIndex: 1,
              input: { tapTime: 123, shooterTapTime: 98 },
              claimedResult: 'goal',
            })
            .then((response) => {
              if (response) props.applyState(response.state);
              props.onResultComplete?.();
            });
        }}
      >
        Бросок
      </button>
    );
  },
}));
vi.mock('../api/onboarding.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OnboardingApi>()),
  startOnboardingTutorial: vi.fn(),
  submitOnboardingTutorialShot: vi.fn(),
}));

const step = {
  id: 'tutorial',
  position: 3,
  kind: 'tutorial_shot' as const,
  title: 'Один бросок',
  description: 'Дождись момента',
  ctaLabel: 'Далее',
  tutorial: { shooterFrequency: 0.12, goalieFrequency: 0.1, goalFrequency: 0.08 },
};
const session = {
  seed: 'a'.repeat(64),
  shotIndex: 1,
  goalieId: 'rookie' as const,
  gameCoreVersion: 55,
  speeds: step.tutorial,
  result: null as 'goal' | 'miss' | null,
};

describe('TutorialShotStep', () => {
  beforeEach(() => {
    playProps = null;
    vi.mocked(startOnboardingTutorial).mockReset().mockResolvedValue(session);
    vi.mocked(submitOnboardingTutorialShot).mockReset();
  });

  it('shows the outdoor court with no goalie and exactly one shot', async () => {
    render(
      <TutorialShotStep
        runId="run"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByRole('button', { name: 'Бросок' });
    expect(playProps).toEqual(
      expect.objectContaining({
        hideGoalie: true,
        shotsTotal: 1,
        hideScoreboard: true,
        hideRinkScoreboard: true,
        hideSoundAction: true,
        playerOptions: expect.objectContaining({
          spriteUrls: {
            left: '/sprites/street-player-left.webp',
            right: '/sprites/street-player-right.webp',
          },
        }),
      }),
    );
    expect(screen.queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument();
  });

  it.each([
    ['goal', 'Неплохо', 'Что дальше?'],
    ['miss', 'Не попал', 'Я приду'],
  ] as const)('switches to the %s story card after the only shot', async (result, title, cta) => {
    vi.mocked(submitOnboardingTutorialShot).mockResolvedValue({
      serverResult: result,
      nextShotIndex: 2,
      result,
    });
    const onContinue = vi.fn();
    render(
      <TutorialShotStep
        runId="run"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Бросок' }));
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: cta }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('restores the persisted result without allowing a second shot', async () => {
    vi.mocked(startOnboardingTutorial).mockResolvedValue({
      ...session,
      shotIndex: 2,
      result: 'miss',
    });
    render(
      <TutorialShotStep
        runId="run"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Не попал' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Бросок' })).not.toBeInTheDocument();
    await waitFor(() => expect(startOnboardingTutorial).toHaveBeenCalledOnce());
  });
});
