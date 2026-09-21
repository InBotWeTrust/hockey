import { act, render, screen, waitFor } from '@testing-library/react';
import { getGoalie } from '@hockey/game-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import type { InitialTrainingRun } from '../api/initialTraining.js';

type CapturedPlayViewProps = {
  active: boolean;
  periodLabel?: string;
  scoreboardPeriodsTotal?: number;
  suppressedByModal: boolean;
  statusNotice?: ReactNode;
  statusNoticeTone?: 'success' | 'error';
  hudAddon?: ReactNode;
  goalOptions?: { spriteUrl?: string };
  resultCopy?: Partial<Record<'goal' | 'save' | 'miss', string>>;
  submitShot: (payload: {
    shotIndex: number;
    input: {
      tapTime: number;
      shooterTapTime: number;
      puckSpeedPerMs: number;
      shooterFrequency: number;
      goalieFrequency: number;
      goalFrequency: number;
    };
    claimedResult: 'goal' | 'save' | 'miss';
  }) => Promise<unknown>;
  onResultComplete: () => void;
};

const testState = vi.hoisted(() => ({
  playViewProps: null as CapturedPlayViewProps | null,
  startExercise: vi.fn(),
  submitShot: vi.fn(),
}));

vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: CapturedPlayViewProps) => {
    testState.playViewProps = props;
    return <div data-testid="play-view" />;
  },
  TRAINING_AMATEUR_GOALIE_OPTIONS: {},
  TRAINING_COURSE_GOAL_OPTIONS: { spriteUrl: '/sprites/training-course-goal-transparent.png' },
  TRAINING_STREET_PLAYER_OPTIONS: {},
}));

vi.mock('../api/initialTraining.js', () => ({
  startInitialTrainingExercise: testState.startExercise,
  submitInitialTrainingShot: testState.submitShot,
}));

import { InitialTrainingPlay } from './InitialTrainingPlay.js';

const run: InitialTrainingRun = {
  run_id: 'run-1',
  exercise: {
    key: 'first-shot',
    position: 1,
    title: 'Первый бросок',
    description: 'Попади в неподвижные пустые ворота.',
    targetGoals: 10,
    rewardStars: 1,
    rewardExperience: 1,
    state: 'available',
  },
  seed: 'a'.repeat(64),
  game_core_version: 1,
  shots_taken: 9,
  goals: 9,
  target_goals: 10,
  started_at: '2026-09-19T20:00:00.000Z',
  server_now: '2026-09-19T20:00:00.000Z',
  scene: {
    has_goalie: false,
    goalie_id: 'rookie',
    goalie_config: getGoalie('rookie'),
    speeds: {
      shooter_frequency: 1,
      goalie_frequency: 1,
      goal_frequency: 0,
      puck_speed_per_ms: 1,
    },
  },
};

describe('initial training completion lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    testState.playViewProps = null;
    testState.startExercise.mockReset().mockResolvedValue(run);
    testState.submitShot.mockReset().mockResolvedValue({
      server_result: 'goal',
      feedback_code: 'goal_timing',
      completed: true,
      reward_granted: { stars: 1, experience: 1 },
      state: {
        run_id: run.run_id,
        exercise_key: run.exercise.key,
        shots_taken: 10,
        goals: 10,
        target_goals: 10,
        scene: run.scene,
      },
    });
  });

  it('shows the objective before the exercise starts', async () => {
    render(
      <InitialTrainingPlay
        exerciseKey="first-shot"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onCourse={vi.fn()}
        onOpenTraining={vi.fn()}
        onCatalogRefresh={vi.fn()}
      />,
    );

    await screen.findByTestId('play-view');
    const dialog = await screen.findByRole('dialog', { name: 'Первый бросок' });
    expect(dialog).toBeInTheDocument();
    const title = screen.getByRole('heading', { name: 'Первый бросок' });
    const description = screen.getByText('Попади в неподвижные пустые ворота.');
    expect(title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(description).toHaveClass(
      'bonus-game-preview-modal__story',
    );
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
    expect(testState.playViewProps?.active).toBe(false);
    expect(testState.playViewProps?.periodLabel).toBe('УПРАЖНЕНИЕ');
    expect(testState.playViewProps?.scoreboardPeriodsTotal).toBe(7);
    expect(testState.playViewProps?.suppressedByModal).toBe(true);
  });

  it('starts only one server run under StrictMode', async () => {
    render(
      <StrictMode>
        <InitialTrainingPlay
          exerciseKey="first-shot"
          onBack={vi.fn()}
          onNext={vi.fn()}
          onCourse={vi.fn()}
          onOpenTraining={vi.fn()}
          onCatalogRefresh={vi.fn()}
        />
      </StrictMode>,
    );

    await screen.findByTestId('play-view');
    expect(testState.startExercise).toHaveBeenCalledTimes(1);
  });

  it('starts the scene only after the player closes the briefing', async () => {
    render(
      <InitialTrainingPlay
        exerciseKey="first-shot"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onCourse={vi.fn()}
        onOpenTraining={vi.fn()}
        onCatalogRefresh={vi.fn()}
      />,
    );

    await screen.findByRole('dialog', { name: 'Первый бросок' });
    await act(async () => {
      screen.getByRole('button', { name: 'Начать' }).click();
    });

    await waitFor(() => expect(testState.playViewProps?.active).toBe(true));
    expect(testState.playViewProps?.suppressedByModal).toBe(false);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Первый бросок' })).toBeNull();
    });
  });

  it('shows post-shot feedback in the scene notice without an exercise HUD', async () => {
    testState.submitShot.mockResolvedValueOnce({
      server_result: 'miss',
      feedback_code: 'miss_left',
      completed: false,
      reward_granted: null,
      state: {
        run_id: run.run_id,
        exercise_key: run.exercise.key,
        shots_taken: 5,
        goals: 4,
        target_goals: 10,
        scene: run.scene,
      },
    });
    render(
      <InitialTrainingPlay
        exerciseKey="first-shot"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onCourse={vi.fn()}
        onOpenTraining={vi.fn()}
        onCatalogRefresh={vi.fn()}
      />,
    );

    await screen.findByRole('dialog', { name: 'Первый бросок' });
    await act(async () => {
      screen.getByRole('button', { name: 'Начать' }).click();
    });
    vi.useFakeTimers();
    await act(async () => {
      await testState.playViewProps?.submitShot({
        shotIndex: 5,
        input: {
          tapTime: 1,
          shooterTapTime: 1,
          puckSpeedPerMs: 1,
          shooterFrequency: 1,
          goalieFrequency: 1,
          goalFrequency: 0,
        },
        claimedResult: 'miss',
      });
    });

    expect(testState.playViewProps?.statusNotice).toBe(
      'Возьми чуть правее — бросок прошёл левее ворот.',
    );
    expect(testState.playViewProps?.statusNoticeTone).toBe('error');
    expect(testState.playViewProps?.hudAddon).toBeUndefined();
    expect(testState.playViewProps?.resultCopy).toEqual({
      goal: 'ГОЛ',
      save: 'СЭЙВ',
      miss: 'МИМО',
    });

    act(() => {
      vi.advanceTimersByTime(3_500);
    });
    expect(testState.playViewProps?.statusNotice).toBeNull();
  });

  it('uses the transparent goal asset for the training course only', async () => {
    render(
      <InitialTrainingPlay
        exerciseKey="first-shot"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onCourse={vi.fn()}
        onOpenTraining={vi.fn()}
        onCatalogRefresh={vi.fn()}
      />,
    );

    await screen.findByTestId('play-view');
    expect(testState.playViewProps?.goalOptions?.spriteUrl).toBe(
      '/sprites/training-course-goal-transparent.png',
    );
  });

  it('keeps the scene active until the final shot animation opens the result', async () => {
    render(
      <InitialTrainingPlay
        exerciseKey="first-shot"
        onBack={vi.fn()}
        onNext={vi.fn()}
        onCourse={vi.fn()}
        onOpenTraining={vi.fn()}
        onCatalogRefresh={vi.fn()}
      />,
    );

    await screen.findByRole('dialog', { name: 'Первый бросок' });
    await act(async () => {
      screen.getByRole('button', { name: 'Начать' }).click();
    });
    await waitFor(() => expect(testState.playViewProps?.active).toBe(true));

    await act(async () => {
      await testState.playViewProps?.submitShot({
        shotIndex: 5,
        input: {
          tapTime: 1,
          shooterTapTime: 1,
          puckSpeedPerMs: 1,
          shooterFrequency: 1,
          goalieFrequency: 1,
          goalFrequency: 0,
        },
        claimedResult: 'goal',
      });
    });

    await waitFor(() => expect(testState.playViewProps?.active).toBe(true));
    expect(testState.playViewProps?.suppressedByModal).toBe(false);

    act(() => testState.playViewProps?.onResultComplete());

    expect(await screen.findByRole('dialog', { name: 'Упражнение завершено' })).toBeInTheDocument();
    expect(testState.playViewProps?.suppressedByModal).toBe(true);
  });
});
