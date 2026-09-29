import { act, render, screen } from '@testing-library/react';
import { getDailyPeriodSpeedPreset, getObservationScene } from '@hockey/game-core';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playProps: null as Record<string, unknown> | null,
  start: vi.fn(), attempt: vi.fn(), decision: vi.fn(),
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
  startObservationStep: mocks.start, startObservationAttempt: mocks.attempt,
  submitObservationDecision: mocks.decision,
}));

import { OpenWindowObservationPlay } from './OpenWindowObservationPlay.js';

function runFor(stepKey: 'notice_frame' | 'notice_motion' | 'notice_independent') {
  const scene = getObservationScene(stepKey, 0);
  return {
    run_id: '11111111-1111-4111-8111-111111111111', step_key: stepKey,
    phase: 'practice' as const, scene, demonstration: scene,
    attempt_token: '22222222-2222-4222-8222-222222222222', attempt_index: 0,
    decision_index: 0, sound_count: 0, practice_decisions: 0, full_runs: 0,
    series_decisions: 0, shots_taken: 0, active_elapsed_ms: 0,
    skip_recorded: false, game_core_version: scene.gameCoreVersion,
    bank_version: scene.bankVersion, attempt_started_at: null,
    server_now: new Date().toISOString(),
  };
}

describe('observation lessons', () => {
  beforeEach(() => {
    mocks.playProps = null;
    mocks.start.mockReset(); mocks.attempt.mockReset(); mocks.decision.mockReset();
  });

  it('explains the first paused opening before completing without a shot', async () => {
    const run = runFor('notice_frame');
    mocks.start.mockResolvedValue({ state: run, restarted_due_to_version: false });
    mocks.attempt.mockResolvedValue({ state: { ...run, attempt_started_at: new Date().toISOString() } });
    mocks.decision.mockResolvedValue({ server_result: null, observation_feedback: 'observed',
      decision_time_ms: run.scene.decisionMs, sound: true, completed: true,
      reward_granted: null, state: { ...run, decision_index: 1 } });
    render(<OpenWindowObservationPlay stepKey="notice_frame" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog');
    await act(async () => screen.getByRole('button', { name: 'Начать показ' }).click());
    expect(mocks.playProps?.speedOverrides).toMatchObject({
      shooterFreq: getDailyPeriodSpeedPreset(1).shooterFrequency,
    });
    expect(mocks.playProps?.maxSceneTimeMs).toBe(run.scene.decisionMs);
    await act(async () => (mocks.playProps?.onSceneClock as (sceneMs: number) => void)(
      run.scene.decisionMs));
    expect(screen.getByText(/появился путь к воротам/i)).toBeInTheDocument();
    expect(mocks.playProps?.rinkOverlay).toBeDefined();
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    expect(mocks.decision).toHaveBeenCalledWith('notice_frame', expect.objectContaining({
      input: { type: 'observed' },
    }));
    expect(mocks.playProps?.submitShot).toBeDefined();
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    expect(screen.getByText('Урок пройден')).toBeInTheDocument();
  });

  it('lets the player classify a paused frame without a timer', async () => {
    const run = runFor('notice_motion');
    mocks.start.mockResolvedValue({ state: run });
    mocks.attempt.mockResolvedValue({ state: { ...run, attempt_started_at: new Date().toISOString() } });
    mocks.decision.mockResolvedValue({ server_result: null, observation_feedback: 'good_mark',
      decision_time_ms: run.scene.decisionMs, sound: true, completed: false,
      reward_granted: null, state: { ...run, scene: getObservationScene('notice_motion', 1),
        decision_index: 1 } });
    render(<OpenWindowObservationPlay stepKey="notice_motion" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog');
    await act(async () => screen.getByRole('button', { name: 'Начать' }).click());
    await act(async () => (mocks.playProps?.onSceneClock as (sceneMs: number) => void)(
      run.scene.decisionMs));
    expect(screen.getByRole('button', { name: 'Можно бросить' })).toBeEnabled();
    await act(async () => screen.getByRole('button', { name: 'Можно бросить' }).click());
    expect(mocks.decision).toHaveBeenCalledWith('notice_motion', expect.objectContaining({
      input: { type: 'classify', answer: 'open' },
    }));
    expect(mocks.playProps?.maxSceneTimeMs).toBe(run.scene.decisionMs);
  });

  it('marks a perceived opening in a moving clip without shooting', async () => {
    const run = runFor('notice_independent');
    mocks.start.mockResolvedValue({ state: run });
    mocks.attempt.mockResolvedValue({ state: { ...run, attempt_started_at: new Date().toISOString() } });
    mocks.decision.mockResolvedValue({ server_result: null, observation_feedback: 'good_mark',
      decision_time_ms: run.scene.decisionMs, sound: true, completed: false,
      reward_granted: null, state: { ...run, scene: getObservationScene('notice_independent', 1),
        decision_index: 1 } });
    render(<OpenWindowObservationPlay stepKey="notice_independent" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog');
    await act(async () => screen.getByRole('button', { name: 'Начать' }).click());
    expect(mocks.playProps?.shotButtonLabel).toBe('ВИЖУ ШАНС');
    await act(async () => (mocks.playProps?.observationAction as (sceneMs: number) => void)(
      run.scene.decisionMs));
    expect(mocks.decision).toHaveBeenCalledWith('notice_independent', expect.objectContaining({
      input: { type: 'mark', tap_time_ms: run.scene.decisionMs },
    }));
    expect(mocks.playProps?.episodeSampler).toBeTypeOf('function');
    expect(mocks.playProps?.initialSceneElapsedMs).toBe(
      Math.max(run.scene.startMs, run.scene.decisionMs - 1000));
    await act(async () => (mocks.playProps?.onSceneClock as (sceneMs: number) => void)(
      run.scene.decisionMs));
    expect(screen.getByText(/Ты заметил шанс/i)).toBeInTheDocument();
  });

  it('submits an untouched moving clip as a skip only at its end', async () => {
    const run = runFor('notice_independent');
    mocks.start.mockResolvedValue({ state: run });
    mocks.attempt.mockResolvedValue({ state: { ...run, attempt_started_at: new Date().toISOString() } });
    mocks.decision.mockResolvedValue({ server_result: null, observation_feedback: 'missed_opening',
      decision_time_ms: run.scene.decisionMs, sound: false, completed: false,
      reward_granted: null, state: { ...run, decision_index: 1 } });
    render(<OpenWindowObservationPlay stepKey="notice_independent" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog');
    await act(async () => screen.getByRole('button', { name: 'Начать' }).click());
    await act(async () => (mocks.playProps?.onSceneClock as (sceneMs: number) => void)(
      run.scene.endMs - 500));
    expect(mocks.decision).not.toHaveBeenCalled();
    await act(async () => (mocks.playProps?.onSceneClock as (sceneMs: number) => void)(
      run.scene.endMs));
    expect(mocks.decision).toHaveBeenCalledWith('notice_independent', expect.objectContaining({
      input: { type: 'skip' },
    }));
  });

  it('retries the same marked moment after a network failure', async () => {
    const run = runFor('notice_independent');
    mocks.start.mockResolvedValue({ state: run });
    mocks.attempt.mockResolvedValue({ state: { ...run, attempt_started_at: new Date().toISOString() } });
    mocks.decision.mockRejectedValueOnce(new Error('network'));
    mocks.decision.mockResolvedValueOnce({ server_result: null, observation_feedback: 'early',
      decision_time_ms: run.scene.decisionMs, sound: false, completed: false,
      reward_granted: null, state: { ...run, decision_index: 1 } });
    render(<OpenWindowObservationPlay stepKey="notice_independent" onBack={vi.fn()}
      onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog');
    await act(async () => screen.getByRole('button', { name: 'Начать' }).click());
    await act(async () => (mocks.playProps?.observationAction as (sceneMs: number) => void)(
      run.scene.decisionMs));
    await act(async () => screen.getByRole('button', { name: 'Повторить отправку' }).click());
    expect(mocks.decision).toHaveBeenCalledTimes(2);
    expect(mocks.decision.mock.calls[0]).toEqual(mocks.decision.mock.calls[1]);
  });
});
