import { act, render, screen, waitFor } from '@testing-library/react';
import { getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvancedTrainingV2RunState } from '../api/advancedTraining.js';

const state = vi.hoisted(() => ({
  playProps: null as Record<string, unknown> | null,
  start: vi.fn(), shot: vi.fn(), assessment: vi.fn(),
}));

vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: Record<string, unknown>) => {
    state.playProps = props;
    return <div data-testid="play-view">{props.overlayControls as ReactNode}</div>;
  },
  TRAINING_AMATEUR_GOALIE_OPTIONS: {}, TRAINING_COURSE_GOAL_OPTIONS: {},
  TRAINING_STREET_PLAYER_OPTIONS: {},
}));
vi.mock('../api/advancedTraining.js', () => ({
  startAdvancedTrainingV2Exercise: state.start,
  submitAdvancedTrainingV2Shot: state.shot,
  startAdvancedTrainingV2Assessment: state.assessment,
}));

import { AdvancedTrainingPlayV2 } from './AdvancedTrainingPlayV2.js';

const scenario = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'practice', 0);
const run: AdvancedTrainingV2RunState = {
  run_id: '11111111-1111-4111-8111-111111111111', exercise_key: 'near_goalie',
  stage: 'practice', side: 'left', side_successes: { left: 0, right: 0 },
  shot_index: 0, scenario_id: scenario.id, scenario,
  seed: 'run-seed', game_core_version: scenario.gameCoreVersion,
  bank_version: scenario.bankVersion, server_now: '2026-09-27T00:00:00.000Z',
};

describe('advanced training V2 demonstration', () => {
  beforeEach(() => {
    state.playProps = null;
    state.start.mockReset().mockResolvedValue({ state: run });
    state.shot.mockReset(); state.assessment.mockReset();
  });

  it('plays a bank-backed goal on each side without submitting a training shot', async () => {
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала — показ' });
    await act(async () => screen.getByRole('button', { name: 'Показать слева' }).click());
    const left = getAdvancedTrainingV2Scenario('near_goalie', 'left', 'demonstration', 0);
    expect(state.playProps?.seed).toBe(left.sessionSeed);
    expect(state.playProps?.sceneShotIndex).toBe(1);
    expect(state.playProps?.initialSceneElapsedMs).toBe(left.sceneStartMs);
    expect(state.playProps?.autoShotDelayMs).toBeUndefined();
    expect(state.playProps?.maxSceneTimeMs).toBe(left.targetTapTimeMs);
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(left.targetTapTimeMs));
    expect(screen.getByRole('button', { name: 'Показать бросок' })).toBeInTheDocument();
    expect(state.playProps?.hitboxesVisible).toBe(true);
    expect(screen.getByText(/Игрок [←→•]/)).toBeInTheDocument();
    expect(screen.getByText(/Ворота [←→•]/)).toBeInTheDocument();
    expect(screen.getByText(/Вратарь [←→•]/)).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Показать бросок' }).click());
    expect(state.playProps?.shotTriggerKey).toBe(1);
    await act(async () => {
      const complete = state.playProps?.onResultComplete as () => void;
      complete();
    });
    expect(await screen.findByText(/Вратарь рядом.*слева.*Нажать.*Попадание/)).toBeInTheDocument();
    expect(state.shot).not.toHaveBeenCalled();
    await act(async () => screen.getByRole('button', { name: 'Повторить показ' }).click());
    expect(state.playProps?.seed).toBe(left.sessionSeed);
    await act(async () => (state.playProps?.onResultComplete as () => void)());
    await act(async () => screen.getByRole('button', { name: 'Показать справа' }).click());
    const right = getAdvancedTrainingV2Scenario('near_goalie', 'right', 'demonstration', 0);
    expect(state.playProps?.seed).toBe(right.sessionSeed);
    await act(async () => (state.playProps?.onResultComplete as () => void)());
    expect(await screen.findByText(/Вратарь рядом.*справа.*Нажать.*Попадание/)).toBeInTheDocument();
    expect(state.shot).not.toHaveBeenCalled();
  });

  it('resumes an existing assessment directly without revealing a demonstration', async () => {
    state.start.mockResolvedValue({ state: { ...run, stage: 'assessment', shot_index: 3 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'Сначала — показ' })).not.toBeInTheDocument();
    expect(state.playProps?.autoShotDelayMs).toBeUndefined();
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(
      scenario.targetTapTimeMs));
    expect(screen.queryByText('Бросай')).not.toBeInTheDocument();
  });

  it('shows cues only in practice and replays a missed window without recording a shot', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    const clock = state.playProps?.onSceneClock as (sceneMs: number, shooterMs: number) => void;
    await act(async () => clock(scenario.sceneStartMs + 10, scenario.sceneStartMs + 10));
    expect(screen.getByText('4')).toBeInTheDocument();
    await act(async () => clock(scenario.targetTapTimeMs, scenario.targetTapTimeMs));
    expect(screen.getByText('Бросай')).toBeInTheDocument();
    const before = state.playProps?.clockRebaseKey;
    await act(async () => clock(scenario.targetTapTimeMs + 800, scenario.targetTapTimeMs + 800));
    expect(state.playProps?.clockRebaseKey).not.toBe(before);
    expect(state.shot).not.toHaveBeenCalled();
  });

  it('announces the right side after a correct left shot', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    const rightScenario = getAdvancedTrainingV2Scenario('near_goalie', 'right', 'practice', 0);
    const next = { ...run, side: 'right', side_successes: { left: 1, right: 0 },
      shot_index: 2, scenario: rightScenario, scenario_id: rightScenario.id };
    state.shot.mockResolvedValue({ server_result: 'goal', success: true,
      actual_technique: 'near_goalie', actual_side: 'left', measurements: null,
      feedback_code: 'correct', stage_finished: false, completed: false,
      reward_granted: null, state: next });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    const submit = state.playProps?.submitShot as (args: Record<string, unknown>) => Promise<{
      state: AdvancedTrainingV2RunState;
    }>;
    let response: { state: AdvancedTrainingV2RunState } | null = null;
    await act(async () => {
      response = await submit({ shotIndex: 1, input: { tapTime: scenario.targetTapTimeMs },
        claimedResult: 'goal' });
    });
    await act(async () => {
      (state.playProps?.applyState as (next: AdvancedTrainingV2RunState) => void)(response!.state);
      (state.playProps?.onResultComplete as () => void)();
    });
    expect(screen.getByText(/Теперь попробуй справа/)).toBeInTheDocument();
  });

  it('shows the server-classified category for an uncredited goal without changing side', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    state.shot.mockResolvedValue({ server_result: 'goal', success: false,
      actual_technique: 'ordinary', actual_side: 'left', measurements: null,
      feedback_code: 'wrong_category', stage_finished: false, completed: false,
      reward_granted: null, state: { ...run, shot_index: 2 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    await act(async () => {
      await (state.playProps?.submitShot as (args: Record<string, unknown>) => Promise<unknown>)(
        { shotIndex: 1, input: { tapTime: scenario.targetTapTimeMs - 950 }, claimedResult: 'goal' });
    });
    expect(String(state.playProps?.statusNotice)).toContain('Простой бросок');
    expect(state.playProps?.goals).toBe(0);
  });
});
