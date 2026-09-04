import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUCK_SPEED_PER_MS } from '@hockey/game-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TRAINING_AMATEUR_GOALIE_OPTIONS,
  TRAINING_STREET_PLAYER_OPTIONS,
  type PlayViewProps,
} from '../game/PlayView.js';
import type * as PlayViewModule from '../game/PlayView.js';
import type * as OnboardingApi from '../api/onboarding.js';
import { startOnboardingTutorial, submitOnboardingTutorialShot } from '../api/onboarding.js';
import { TutorialShotStep } from './TutorialShotStep.js';

let playProps: PlayViewProps<unknown> | null = null;

vi.mock('../game/PlayView.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PlayViewModule>()),
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
              })
              .catch((error: unknown) => props.onSubmitError?.(error));
          }}
        >
          Mock shot
        </button>
        <button type="button" onClick={() => void props.inactiveAction?.()}>
          {props.shotButtonLabel ?? 'БРОСОК'}
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
        hideScoreboard: true,
        playerOptions: TRAINING_STREET_PLAYER_OPTIONS,
        goalieOptions: TRAINING_AMATEUR_GOALIE_OPTIONS,
        speedOverrides: {
          shooterFreq: 0.23,
          goalieFreq: 0.32,
          goalFreq: 0.19,
          puckSpeed: PUCK_SPEED_PER_MS,
        },
        resultCopy: { save: 'Ещё раз', miss: 'Ещё раз', post: 'Ещё раз', goal: 'Гол' },
      }),
    );
    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeEnabled();
    expect(playProps?.playerOptions).toBe(TRAINING_STREET_PLAYER_OPTIONS);
    expect(playProps?.goalOptions).toBeUndefined();
    expect(playProps?.goalieOptions).toBe(TRAINING_AMATEUR_GOALIE_OPTIONS);
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
    expect(screen.getByRole('button', { name: 'БРОСОК' })).toBeEnabled();
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
    expect(playProps).toEqual(
      expect.objectContaining({ active: false, shotButtonLabel: 'Далее' }),
    );
    expect(playProps?.shots).toBe(2);
    expect(playProps?.goals).toBe(1);
  });

  it('uses isolated preview tutorial adapters and the admin preview run id', async () => {
    const previewStart = vi.fn().mockResolvedValue({ ...session, runId: 'preview-run' });
    const previewSubmit = vi.fn().mockResolvedValue({
      serverResult: 'save',
      nextShotIndex: 2,
      goalConfirmed: false,
    });
    const tutorialApi = { start: previewStart, submit: previewSubmit };
    render(
      <TutorialShotStep
        runId="preview-pending"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        tutorialApi={tutorialApi}
      />,
    );
    await screen.findByTestId('play-view');
    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));

    await waitFor(() =>
      expect(previewSubmit).toHaveBeenCalledWith('preview-run', {
        shotIndex: 1,
        input: { tapTime: 123, shooterTapTime: 98 },
        claimedResult: 'goal',
      }),
    );
    expect(previewStart).toHaveBeenCalledWith('preview-pending');
    expect(startOnboardingTutorial).not.toHaveBeenCalled();
    expect(submitOnboardingTutorialShot).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'no-commit rejection', resumedShotIndex: 1, retriedShotIndex: 1 },
    { label: 'commit-lost rejection', resumedShotIndex: 2, retriedShotIndex: 2 },
  ])('resyncs $label on the same preview run', async ({ resumedShotIndex, retriedShotIndex }) => {
    const previewStart = vi
      .fn()
      .mockResolvedValueOnce({ ...session, runId: 'preview-run' })
      .mockResolvedValueOnce({ ...session, runId: 'preview-run', shotIndex: resumedShotIndex });
    const previewSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce({
        serverResult: 'save',
        nextShotIndex: retriedShotIndex + 1,
        goalConfirmed: false,
      });
    const tutorialApi = { start: previewStart, submit: previewSubmit };
    render(
      <TutorialShotStep
        runId="preview-pending"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
        tutorialApi={tutorialApi}
      />,
    );
    await screen.findByTestId('play-view');
    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() => expect(previewStart).toHaveBeenNthCalledWith(2, 'preview-run'));
    fireEvent.click(await screen.findByRole('button', { name: 'Попробовать ещё раз' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() =>
      expect(previewSubmit).toHaveBeenNthCalledWith(
        2,
        'preview-run',
        expect.objectContaining({ shotIndex: retriedShotIndex }),
      ),
    );
    expect(startOnboardingTutorial).not.toHaveBeenCalled();
    expect(submitOnboardingTutorialShot).not.toHaveBeenCalled();
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

  it('does not clip the fixed gameplay screen inside a short rink wrapper', () => {
    expect(onboardingCss).not.toMatch(/\.onboarding-tutorial__rink\s*>\s*main/);
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

    expect(playProps?.hideBackAction).toBe(false);
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
    expect(playProps?.hideBackAction).toBe(true);
  });

  it('continues from the gameplay button after the server confirms the goal', async () => {
    const onContinue = vi.fn();
    vi.mocked(submitOnboardingTutorialShot).mockResolvedValue({
      serverResult: 'goal',
      nextShotIndex: 2,
      goalConfirmed: true,
    });
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        onGoalConfirmed={vi.fn()}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );
    await screen.findByTestId('play-view');

    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Далее' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
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

  it('re-syncs the authoritative shot index after a rejected optimistic attempt', async () => {
    const onGoalConfirmed = vi.fn();
    vi.mocked(startOnboardingTutorial)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);
    vi.mocked(submitOnboardingTutorialShot)
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ serverResult: 'goal', nextShotIndex: 2, goalConfirmed: true });
    render(
      <TutorialShotStep
        runId="run-1"
        step={step}
        goalConfirmed={false}
        canGoBack
        onGoalConfirmed={onGoalConfirmed}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');

    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() => expect(startOnboardingTutorial).toHaveBeenCalledTimes(2));
    expect(playProps?.shots).toBe(0);
    expect(submitOnboardingTutorialShot).toHaveBeenNthCalledWith(
      1,
      'run-1',
      expect.objectContaining({ shotIndex: 1 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() => expect(onGoalConfirmed).toHaveBeenCalledTimes(1));
    expect(submitOnboardingTutorialShot).toHaveBeenNthCalledWith(
      2,
      'run-1',
      expect.objectContaining({ shotIndex: 1 }),
    );
  });

  it('continues from the advanced index when a rejected response was committed by the server', async () => {
    vi.mocked(startOnboardingTutorial)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, shotIndex: 2 });
    vi.mocked(submitOnboardingTutorialShot)
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce({ serverResult: 'save', nextShotIndex: 3, goalConfirmed: false });
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

    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));
    await waitFor(() => expect(playProps?.shots).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock shot' }));

    await waitFor(() =>
      expect(submitOnboardingTutorialShot).toHaveBeenNthCalledWith(
        2,
        'run-1',
        expect.objectContaining({ shotIndex: 2 }),
      ),
    );
  });
});
