import { act, render, screen } from '@testing-library/react';
import { getDailyPeriodSpeedPreset, getOpenWindowScene } from '@hockey/game-core';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playProps: null as Record<string, unknown> | null,
  start: vi.fn(), attempt: vi.fn(), decision: vi.fn(), finish: vi.fn(),
}));
vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: Record<string, unknown>) => {
    mocks.playProps = props;
    return <div data-testid="play-view">{props.overlayControls as ReactNode}</div>;
  },
  TRAINING_AMATEUR_GOALIE_OPTIONS: {}, TRAINING_COURSE_GOAL_OPTIONS: {},
  TRAINING_STREET_PLAYER_OPTIONS: {},
}));
vi.mock('../api/openWindowTraining.js', () => ({
  startOpenWindowStep: mocks.start, startOpenWindowAttempt: mocks.attempt,
  submitOpenWindowDecision: mocks.decision, finishOpenWindowSeries: mocks.finish,
}));

import { OpenWindowTrainingPlay } from './OpenWindowTrainingPlay.js';

const practice = getOpenWindowScene('notice_frame', 1);
const demonstration = getOpenWindowScene('notice_frame', 0);
const run = {
  run_id: '11111111-1111-4111-8111-111111111111', step_key: 'notice_frame',
  phase: 'practice' as const, scene: practice, demonstration,
  attempt_token: '22222222-2222-4222-8222-222222222222', attempt_index: 0,
  decision_index: 0, sound_count: 0, practice_decisions: 0, full_runs: 0,
  series_decisions: 0, shots_taken: 0, active_elapsed_ms: 0, skip_recorded: false,
  game_core_version: practice.gameCoreVersion, bank_version: practice.bankVersion,
  attempt_started_at: null, server_now: new Date().toISOString(),
};

describe('open-window training play', () => {
  beforeEach(() => {
    mocks.playProps = null;
    mocks.start.mockReset().mockResolvedValue({ state: run, restarted_due_to_version: false });
    mocks.attempt.mockReset().mockResolvedValue({ state: { ...run,
      attempt_started_at: new Date().toISOString() } });
    mocks.decision.mockReset(); mocks.finish.mockReset();
  });

  it('demonstrates daily first-period movement without the old episode sampler or shoot cue', async () => {
    render(<OpenWindowTrainingPlay stepKey="notice_frame" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    expect(await screen.findByRole('dialog', { name: 'Сначала – показ' })).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Смотреть показ' }).click());
    expect(mocks.playProps?.seed).toBe(demonstration.sessionSeed);
    expect(mocks.playProps?.episodeSampler).toBeUndefined();
    expect(mocks.playProps?.speedOverrides).toMatchObject({
      shooterFreq: getDailyPeriodSpeedPreset(1).shooterFrequency,
      goalieFreq: getDailyPeriodSpeedPreset(1).goalieFrequency,
      goalFreq: getDailyPeriodSpeedPreset(1).goalFrequency,
    });
    expect(mocks.playProps?.maxSceneTimeMs).toBe(demonstration.targetMs);
    expect(screen.queryByText('Бросай')).not.toBeInTheDocument();
  });

  it('shows the normal result before coaching and explicitly restarts an episode', async () => {
    const decided = { ...run, decision_index: 1, attempt_index: 1,
      attempt_token: '33333333-3333-4333-8333-333333333333' };
    mocks.decision.mockResolvedValue({ server_result: 'goal',
      evaluation: { opportunity: 'shot_window', timing: 'on_time',
        relevant: true, onTime: true, result: 'goal' },
      sound: true, completed: false, reward_granted: null, state: decided });
    render(<OpenWindowTrainingPlay stepKey="notice_frame" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала – показ' });
    await act(async () => screen.getByRole('button', { name: 'Смотреть показ' }).click());
    await act(async () => (mocks.playProps?.onSceneClock as (time: number) => void)(
      demonstration.targetMs));
    expect(screen.getByText('Открытый путь к воротам')).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    await act(async () => (mocks.playProps?.onResultComplete as () => void)());
    await act(async () => screen.getByRole('button', { name: 'Попробовать самому' }).click());
    await act(async () => screen.getByRole('button', { name: 'Начать практику' }).click());
    const submit = mocks.playProps?.submitShot as (args: Record<string, unknown>) => Promise<unknown>;
    let result: unknown;
    await act(async () => {
      result = await submit({ input: { tapTime: practice.targetMs }, claimedResult: 'goal' });
    });
    expect(result).toMatchObject({ serverResult: 'goal', resultPresentation: { title: 'Гол' } });
    expect(screen.queryByText('Хороший момент')).not.toBeInTheDocument();
    await act(async () => (mocks.playProps?.onResultComplete as () => void)());
    expect(screen.getByText('Хороший момент')).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    expect(mocks.attempt).toHaveBeenCalledTimes(2);
  });

  it('updates the pace countdown from the scene clock and keeps it paused during feedback', async () => {
    const paceScene = getOpenWindowScene('pace_short', 1);
    const paceRun = { ...run, step_key: 'pace_short', scene: paceScene,
      demonstration: getOpenWindowScene('pace_short', 0) };
    mocks.start.mockResolvedValue({ state: paceRun });
    mocks.attempt.mockResolvedValue({ state: { ...paceRun,
      attempt_started_at: new Date().toISOString() } });
    render(<OpenWindowTrainingPlay stepKey="pace_short" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала – показ' });
    await act(async () => screen.getByRole('button', { name: 'Смотреть показ' }).click());
    await act(async () => (mocks.playProps?.onSceneClock as (time: number) => void)(
      paceRun.demonstration.targetMs));
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    await act(async () => (mocks.playProps?.onResultComplete as () => void)());
    await act(async () => screen.getByRole('button', { name: 'Попробовать самому' }).click());
    await act(async () => screen.getByRole('button', { name: 'Начать практику' }).click());
    const initial = mocks.playProps?.timer;
    expect(initial).toBe('30 с');
    await act(async () => (mocks.playProps?.onSceneClock as (time: number) => void)(
      paceScene.startMs + 1200));
    expect(mocks.playProps?.timer).not.toBe(initial);
  });
});
