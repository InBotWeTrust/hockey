import { act, render, screen, waitFor } from '@testing-library/react';
import { getGoalie } from '@hockey/game-core';
import { StrictMode, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvancedTrainingRunState } from '../api/advancedTraining.js';

type CapturedPlayViewProps = {
  active: boolean;
  suppressedByModal: boolean;
  periodLabel?: string;
  scoreLabel?: string;
  autoShotDelayMs?: number;
  timer?: string;
  timerLabel?: string;
  statusNotice?: ReactNode;
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
  start: vi.fn(),
  shot: vi.fn(),
  assessment: vi.fn(),
  restart: vi.fn(),
}));

vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: CapturedPlayViewProps) => {
    testState.playViewProps = props;
    return <div data-testid="play-view" />;
  },
  TRAINING_AMATEUR_GOALIE_OPTIONS: {},
  TRAINING_COURSE_GOAL_OPTIONS: {},
  TRAINING_STREET_PLAYER_OPTIONS: {},
}));

vi.mock('../api/advancedTraining.js', () => ({
  startAdvancedTrainingExercise: testState.start,
  submitAdvancedTrainingShot: testState.shot,
  startAdvancedTrainingAssessment: testState.assessment,
  restartAdvancedTrainingPractice: testState.restart,
}));

import { AdvancedTrainingPlay } from './AdvancedTrainingPlay.js';

const scenario = {
  id: 'board-side-1',
  exerciseKey: 'board-side' as const,
  targetTapTimeMs: 1000,
  timingWindowMs: 120,
  requiredSide: 'left' as const,
  minOpenWindowMs: null,
  maxOpenWindowMs: null,
  requireCounterDirection: false,
  seriesGoals: 1,
  intentionalMissFirst: false,
};

const practice: AdvancedTrainingRunState = {
  run_id: '11111111-1111-4111-8111-111111111111',
  exercise_key: 'board-side',
  stage: 'practice',
  situation_index: 0,
  total_situations: 5,
  successes: 0,
  shots_taken: 0,
  series_step: 0,
  scenario,
  seed: 'a'.repeat(64),
  game_core_version: 61,
  started_at: '2026-09-19T20:00:00.000Z',
  server_now: '2026-09-19T20:00:00.000Z',
  scene: {
    goalie_id: 'rookie',
    goalie_config: getGoalie('rookie'),
    speeds: {
      shooter_frequency: 0.75,
      goalie_frequency: 0.6,
      goal_frequency: 0.5,
      puck_speed_per_ms: 1.25,
    },
  },
};

describe('advanced training play', () => {
  beforeEach(() => {
    testState.playViewProps = null;
    testState.start.mockReset().mockResolvedValue({ demonstrations: [scenario, scenario], state: practice });
    testState.shot.mockReset();
    testState.assessment.mockReset();
    testState.restart.mockReset();
  });

  it('starts one server run under StrictMode and autoplays two demonstrations before practice', async () => {
    render(
      <StrictMode>
        <AdvancedTrainingPlay
          exerciseKey="board-side"
          onBack={vi.fn()}
          onCourse={vi.fn()}
          onCatalogRefresh={vi.fn()}
        />
      </StrictMode>,
    );

    await screen.findByTestId('play-view');
    expect(testState.start).toHaveBeenCalledTimes(1);
    expect(testState.playViewProps?.periodLabel).toBe('УПРАЖНЕНИЯ');
    expect(testState.playViewProps?.timer).toBe('0/5');
    expect(testState.playViewProps?.scoreLabel).toBe('ПРИЁМЫ');
    expect(testState.playViewProps?.timerLabel).toBe('МОМЕНТЫ');
    expect(testState.playViewProps?.active).toBe(true);
    expect(testState.playViewProps?.autoShotDelayMs).toBe(scenario.targetTapTimeMs);
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => testState.playViewProps?.onResultComplete());
    expect(testState.playViewProps?.autoShotDelayMs).toBe(scenario.targetTapTimeMs);
    await act(async () => testState.playViewProps?.onResultComplete());
    await waitFor(() => expect(testState.playViewProps?.active).toBe(true));
    expect(testState.playViewProps?.autoShotDelayMs).toBeUndefined();
    expect(testState.playViewProps?.timer).toBe('1/5');
  });

  it('shows server technique feedback and moves from practice to assessment', async () => {
    testState.shot.mockResolvedValue({
      server_result: 'goal',
      feedback_code: 'technique_success',
      situation_complete: true,
      situation_success: true,
      stage_finished: true,
      completed: false,
      passed: null,
      reward_granted: null,
      state: { ...practice, situation_index: 5, successes: 4, shots_taken: 5 },
    });
    const assessment = { ...practice, stage: 'assessment' as const, total_situations: 10 };
    testState.assessment.mockResolvedValue({ state: assessment });
    render(
      <AdvancedTrainingPlay
        exerciseKey="board-side"
        onBack={vi.fn()}
        onCourse={vi.fn()}
        onCatalogRefresh={vi.fn()}
      />,
    );
    await screen.findByTestId('play-view');
    await act(async () => testState.playViewProps?.onResultComplete());
    await act(async () => testState.playViewProps?.onResultComplete());
    await act(async () => {
      await testState.playViewProps?.submitShot({
        shotIndex: 1,
        input: {
          tapTime: 1000,
          shooterTapTime: 1000,
          puckSpeedPerMs: 1.25,
          shooterFrequency: 0.75,
          goalieFrequency: 0.6,
          goalFrequency: 0.5,
        },
        claimedResult: 'goal',
      });
      testState.playViewProps?.onResultComplete();
    });

    expect(testState.playViewProps?.statusNotice).toBeTruthy();
    expect(await screen.findByRole('dialog', { name: 'Практика завершена' })).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Начать зачёт' }).click());
    await waitFor(() => expect(testState.playViewProps?.timerLabel).toBe('МОМЕНТЫ'));
    expect(testState.playViewProps?.scoreLabel).toBe('ПРИЁМЫ');
    expect(testState.assessment).toHaveBeenCalledWith('board-side', practice.run_id);
  });
});
