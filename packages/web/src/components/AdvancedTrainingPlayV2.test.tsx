import { act, render, screen, waitFor } from '@testing-library/react';
import { getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvancedTrainingV2RunState } from '../api/advancedTraining.js';

const state = vi.hoisted(() => ({
  playProps: null as Record<string, unknown> | null,
  start: vi.fn(), shot: vi.fn(), assessment: vi.fn(),
}));

vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: Record<string, unknown>) => {
    state.playProps = props;
    return <div data-testid="play-view" />;
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
    expect(state.playProps?.initialSceneElapsedMs).toBe(left.sceneStartMs);
    expect(state.playProps?.autoShotDelayMs).toBeCloseTo(left.targetTapTimeMs - left.sceneStartMs, 4);
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
  });
});
