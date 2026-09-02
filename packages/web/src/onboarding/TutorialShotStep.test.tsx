import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUCK_SPEED_PER_MS } from '@hockey/game-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayViewProps } from '../game/PlayView.js';
import type * as OnboardingApi from '../api/onboarding.js';
import { startOnboardingTutorial, submitOnboardingTutorialShot } from '../api/onboarding.js';
import { TutorialShotStep } from './TutorialShotStep.js';

let playProps: PlayViewProps<unknown> | null = null;

vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: PlayViewProps<unknown>) => {
    playProps = props;
    return (
      <div data-testid="play-view">
        <button type="button" onClick={props.onBack}>
          Play Back
        </button>
        <button
          type="button"
          onClick={() => {
            const shotIndex = props.shots + 1;
            props.optimisticAddShot('goal');
            void props
              .submitShot({
                shotIndex,
                input: {
                  tapTime: 123,
                  shooterTapTime: 98,
                  shooterFrequency: 99,
                  goalieFrequency: 99,
                  goalFrequency: 99,
                  puckSpeedPerMs: 99,
                },
                claimedResult: 'goal',
              })
              .then((result) => {
                if (result) props.applyState(result.state);
              });
          }}
        >
          Mock shot
        </button>
      </div>
    );
  },
}));

vi.mock('../api/onboarding.js', async (importOriginal) => ({
  ...(await importOriginal<typeof OnboardingApi>()),
  startOnboardingTutorial: vi.fn(),
  submitOnboardingTutorialShot: vi.fn(),
}));

const step = {
  id: 'tutorial-step',
  position: 3,
  kind: 'tutorial_shot' as const,
  title: 'Забей первую шайбу',
  description: 'Поймай момент',
  ctaLabel: 'Далее',
  tutorial: { shooterFrequency: 0.22, goalieFrequency: 0.31, goalFrequency: 0.18 },
};

const session = {
  seed: 'a'.repeat(64),
  shotIndex: 1,
  goalieId: 'rookie' as const,
  gameCoreVersion: 1,
  speeds: { shooterFrequency: 0.23, goalieFrequency: 0.32, goalFrequency: 0.19 },
  goalConfirmed: false,
};
const onboardingCss = readFileSync(resolve(process.cwd(), 'src/onboarding/onboarding.css'), 'utf8');

describe('TutorialShotStep', () => {
  beforeEach(() => {
    playProps = null;
    vi.mocked(startOnboardingTutorial).mockReset().mockResolvedValue(session);
    vi.mocked(submitOnboardingTutorialShot).mockReset();
  });

  it('starts once and configures the normal perspective court with only movement speed overrides', async () => {
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    await screen.findByTestId('play-view');
    expect(startOnboardingTutorial).toHaveBeenCalledWith('run-1');
    expect(playProps).toEqual(
      expect.objectContaining({
        active: true,
        seed: session.seed,
        goalieId: 'rookie',
        periodNumber: 1,
        shotsTotal: undefined,
        longCourtBackground: '/sprites/new-light-court.webp',
        hideScoreboard: true,
        speedOverrides: {
          shooterFreq: 0.23,
          goalieFreq: 0.32,
          goalFreq: 0.19,
          puckSpeed: PUCK_SPEED_PER_MS,
        },
        resultCopy: { save: 'Ещё раз', miss: 'Ещё раз', post: 'Ещё раз', goal: 'Первая шайба!' },
      }),
    );
    expect(screen.getByText('Поймай момент и забей шайбу')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
    expect(playProps?.playerOptions).toBeUndefined();
    expect(playProps?.goalOptions).toBeUndefined();
    expect(playProps?.goalieOptions).toBeUndefined();
    expect(playProps?.shotsTotal).toBeUndefined();
  });

  it('shares the tutorial start request across Strict Mode effect replay', async () => {
    render(
      <StrictMode>
        <TutorialShotStep
          runId="run-1"
          step={step}
          goalConfirmed={false}
          onGoalConfirmed={vi.fn()}
          onBack={vi.fn()}
          onContinue={vi.fn()}
        />
      </StrictMode>,
    );

    await screen.findByTestId('play-view');
    expect(startOnboardingTutorial).toHaveBeenCalledTimes(1);
  });

  it('sends only authoritative timing plus claimed result and unlocks only on a server goal', async () => {
    const onGoalConfirmed = vi.fn();
    vi.mocked(submitOnboardingTutorialShot)
      .mockResolvedValueOnce({ serverResult: 'save', nextShotIndex: 2, goalConfirmed: false })
      .mockResolvedValueOnce({ serverResult: 'goal', nextShotIndex: 3, goalConfirmed: true });
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={onGoalConfirmed}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');

    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() =>
      expect(submitOnboardingTutorialShot).toHaveBeenNthCalledWith(1, 'run-1', {
        shotIndex: 1,
        input: { tapTime: 123, shooterTapTime: 98 },
        claimedResult: 'goal',
      }),
    );
    expect(onGoalConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
    expect(playProps?.shots).toBe(1);
    expect(playProps?.goals).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() => expect(onGoalConfirmed).toHaveBeenCalledTimes(1));
    expect(submitOnboardingTutorialShot).toHaveBeenNthCalledWith(
      2,
      'run-1',
      expect.objectContaining({ shotIndex: 2 }),
    );
    expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled();
    expect(playProps?.shots).toBe(2);
    expect(playProps?.goals).toBe(1);
  });

  it('shows a retryable start error without mounting game progress', async () => {
    vi.mocked(startOnboardingTutorial)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(session);
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить');
    expect(screen.queryByTestId('play-view')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findByTestId('play-view');
    expect(startOnboardingTutorial).toHaveBeenCalledTimes(2);
  });

  it('contains the fixed PlayView inside the tutorial rink', () => {
    expect(onboardingCss).toMatch(
      /\.onboarding-tutorial__rink\s*>\s*main\s*\{[^}]*position:\s*absolute\s*!important/s,
    );
  });

  it('shows exactly one outer Back later in the flow and hides PlayView navigation', async () => {
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        canGoBack
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');

    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1);
    expect(playProps?.hideBackAction).toBe(true);
  });

  it('has no Back when the server publishes the tutorial as the first step', async () => {
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        canGoBack={false}
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');

    expect(screen.queryByRole('button', { name: 'Назад' })).not.toBeInTheDocument();
  });

  it('detects reduced motion before mounting the shot surface', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        canGoBack
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');

    expect(playProps?.reduceMotion).toBe(true);
    vi.unstubAllGlobals();
  });

  it('shows a retryable shot error and leaves another attempt available', async () => {
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        canGoBack
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');
    act(() => playProps?.onSubmitError?.(new Error('offline')));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось отправить бросок');
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mock shot' })).toBeEnabled();
  });
});
