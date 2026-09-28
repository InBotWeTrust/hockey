import { act, render, screen, waitFor } from '@testing-library/react';
import { findNextAdvancedTrainingWindow, getAdvancedTrainingContinuousSeed,
  getAdvancedTrainingV2Scenario } from '@hockey/game-core';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvancedTrainingV2RunState } from '../api/advancedTraining.js';
import { ADVANCED_TRAINING_V2_TITLES } from './AdvancedTrainingV2Explanation.js';

const state = vi.hoisted(() => ({
  playProps: null as Record<string, unknown> | null,
  start: vi.fn(), shot: vi.fn(), assessment: vi.fn(),
}));

vi.mock('../game/PlayView.js', () => ({
  PlayView: (props: Record<string, unknown>) => {
    state.playProps = props;
    return <div data-testid="play-view">{props.rinkUnderlay as ReactNode}
      {props.overlayControls as ReactNode}{props.rinkOverlay as ReactNode}</div>;
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
const movement = { runSeed: getAdvancedTrainingContinuousSeed('near_goalie'),
  technique: 'near_goalie' as const, side: 'left' as const,
  speeds: scenario.speeds, goalieId: scenario.goalieId };
const firstWindow = findNextAdvancedTrainingWindow(movement, 0)!;
const run: AdvancedTrainingV2RunState = {
  run_id: '11111111-1111-4111-8111-111111111111', exercise_key: 'near_goalie',
  stage: 'practice', side: 'left', side_successes: { left: 0, right: 0 },
  shot_index: 0, scenario_id: scenario.id, scenario,
  movement_id: 'continuous-v1:near_goalie', movement, resume_scene_ms: 0,
  seed: 'run-seed', game_core_version: scenario.gameCoreVersion,
  bank_version: scenario.bankVersion, server_now: '2026-09-27T00:00:00.000Z',
};

describe('advanced training V2 demonstration', () => {
  beforeEach(() => {
    state.playProps = null;
    state.start.mockReset().mockResolvedValue({ state: run });
    state.shot.mockReset(); state.assessment.mockReset();
  });

  it.each(Object.entries(ADVANCED_TRAINING_V2_TITLES) as Array<[
    keyof typeof ADVANCED_TRAINING_V2_TITLES, string,
  ]>)('labels the %s demonstration as a situation', async (exerciseKey, title) => {
    render(<AdvancedTrainingPlayV2 exerciseKey={exerciseKey}
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала – показ' });
    await act(async () => screen.getByRole('button', { name: exerciseKey === 'near_goalie'
      ? 'Показать: вратарь слева' : 'Показать слева' }).click());
    expect(state.playProps?.statusNotice).toBe(exerciseKey === 'near_goalie'
      ? 'Ситуация "Вратарь рядом"\nВратарь слева от ворот'
      : `Ситуация "${title}"\nПоказ слева`);
  });

  it('uses the exercise seed in the demonstration on both sides', async () => {
    render(<AdvancedTrainingPlayV2 exerciseKey="super_precise"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала – показ' });
    await act(async () => screen.getByRole('button', { name: 'Показать слева' }).click());
    expect(state.playProps?.seed).toBe(getAdvancedTrainingContinuousSeed('super_precise'));
    await act(async () => (state.playProps?.onResultComplete as () => void)());
    await act(async () => screen.getByRole('button', { name: 'Показать справа' }).click());
    expect(state.playProps?.seed).toBe(getAdvancedTrainingContinuousSeed('super_precise'));
  });

  it('plays a bank-backed goal on each side without submitting a training shot', async () => {
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала – показ' });
    expect(screen.getByText('– Посмотри как выполняется бросок, когда вратарь находится слева от ворот, а затем когда справа. Потом попробуй выполнить сам.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Аватар наставника в модалке' }))
      .toHaveAttribute('src', '/sprites/advanced-training-coach-modal.webp');
    await act(async () => screen.getByRole('button', { name: 'Показать: вратарь слева' }).click());
    const left = findNextAdvancedTrainingWindow(movement, 0)!;
    expect(state.playProps?.seed).toBe(movement.runSeed);
    expect(state.playProps?.sceneShotIndex).toBe(1);
    expect(state.playProps?.initialSceneElapsedMs).toBe(
      left.targetMs - 4 * 500 / movement.speeds.shooterFrequency);
    expect(state.playProps?.autoShotDelayMs).toBeUndefined();
    expect(state.playProps?.maxSceneTimeMs).toBe(left.targetMs);
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(left.targetMs));
    expect(screen.getByText('Бросок нужно совершать примерно в этот момент').textContent)
      .toBe('Бросок нужно совершать примерно в этот момент');
    expect(screen.getByText(/Ты движешься влево, ворота движутся вправо, вратарь движется вправо/)).toBeInTheDocument();
    expect(screen.getByText('Бросай сейчас: шайбе нужно время долететь до ворот.')).toBeInTheDocument();
    expect(screen.getByText(/^– Ты движешься влево/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
    expect(state.playProps?.overlayControlsTop).toBe('49%');
    expect(state.playProps?.overlayControlsCentered).toBe(true);
    expect(state.playProps?.statusNoticeUnderScoreboard).toBe(true);
    expect(state.playProps?.hitboxesVisible).toBe(false);
    expect(screen.getByLabelText('Направления движения')).toBeInTheDocument();
    const playerDirection = screen.getByLabelText('Игрок движется влево');
    expect(playerDirection).toBeInTheDocument();
    const playerArrowY = Number(playerDirection.getAttribute('transform')?.match(/translate\([^ ]+ ([^)]+)\)/)?.[1]);
    expect(playerArrowY).toBeGreaterThan(605);
    expect(playerArrowY).toBeLessThan(640);
    expect(screen.getByLabelText('Ворота движутся вправо')).toBeInTheDocument();
    expect(screen.getByLabelText('Вратарь движется вправо')).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).not.toMatch(/Игрок [←→•]|Ворота [←→•]|Вратарь [←→•]/);
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    expect(state.playProps?.shotTriggerKey).toBe(1);
    await act(async () => {
      const complete = state.playProps?.onResultComplete as () => void;
      complete();
    });
    expect(await screen.findByRole('dialog', { name: 'Разбор ситуации' })).toBeInTheDocument();
    expect(screen.getByText(/Вратарь рядом.*слева.*Пока шайба летела|Вратарь рядом.*Пока шайба летела.*слева/)).toBeInTheDocument();
    expect(state.shot).not.toHaveBeenCalled();
    await act(async () => screen.getByRole('button', { name: 'Повторить показ' }).click());
    expect(state.playProps?.seed).toBe(movement.runSeed);
    await act(async () => (state.playProps?.onResultComplete as () => void)());
    await act(async () => screen.getByRole('button', { name: 'Показать: вратарь справа' }).click());
    expect(state.playProps?.seed).toBe(movement.runSeed);
    expect(state.playProps?.statusNotice).toBe('Ситуация "Вратарь рядом"\nВратарь справа от ворот');
    await act(async () => (state.playProps?.onResultComplete as () => void)());
    expect(await screen.findByText(/Вратарь рядом.*Пока шайба летела.*справа/)).toBeInTheDocument();
    expect(state.shot).not.toHaveBeenCalled();
  });

  it('shows arrival ghosts and the shot axis only on the paused demonstration frame', async () => {
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Сначала – показ' });
    await act(async () => screen.getByRole('button', { name: 'Показать: вратарь слева' }).click());
    expect(screen.queryByLabelText('Ворота при прилёте шайбы')).not.toBeInTheDocument();
    const demo = findNextAdvancedTrainingWindow(movement, 0)!;
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(demo.targetMs));
    expect(screen.getByRole('img', { name: 'Аватар наставника' }))
      .toHaveAttribute('src', '/sprites/advanced-training-coach-avatar.webp');
    const futureGoal = screen.getByLabelText('Ворота при прилёте шайбы');
    const futureGoalie = screen.getByLabelText('Вратарь при встрече с шайбой');
    expect(futureGoal.querySelector('image')).toHaveAttribute('opacity', '0.38');
    expect(futureGoalie.querySelector('image')).toHaveAttribute('opacity', '0.38');
    const shotLine = screen.getByLabelText('Линия броска игрока');
    expect(shotLine.getAttribute('x1')).toBe(shotLine.getAttribute('x2'));
    expect(Number(shotLine.getAttribute('y1'))).toBeGreaterThan(0);
    expect(Number(shotLine.getAttribute('y2'))).toBeGreaterThan(Number(shotLine.getAttribute('y1')));
    expect(screen.getByLabelText(/Будущие ворота (движутся|стоит)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Будущий вратарь (движется|стоит)/)).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    expect(screen.queryByRole('img', { name: 'Аватар наставника' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ворота при прилёте шайбы')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Линия броска игрока')).not.toBeInTheDocument();
  });

  it('resumes an existing assessment directly without revealing a demonstration', async () => {
    state.start.mockResolvedValue({ state: { ...run, stage: 'assessment', shot_index: 3 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'Сначала – показ' })).not.toBeInTheDocument();
    expect(state.playProps?.autoShotDelayMs).toBeUndefined();
    expect(state.playProps?.practiceShotWindow).toBeUndefined();
    expect(screen.getByText(/Ожидаем\s+момент/)).toBeInTheDocument();
    const countdownMs = firstWindow.startMs - 3_500;
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(
      countdownMs));
    expect(screen.getByText('4').closest('.game-scoreboard')).toBeInTheDocument();
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(
      firstWindow.targetMs));
    expect(screen.queryByText('Бросай')).not.toBeInTheDocument();
    expect(state.playProps?.seed).toBe(movement.runSeed);
  });

  it('shows cues only in practice and replays a missed window without recording a shot', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    const clock = state.playProps?.onSceneClock as (sceneMs: number, shooterMs: number) => void;
    expect(screen.getByText(/Ожидаем\s+момент/).textContent).toBe('Ожидаем\nмомент');
    const firstCueMs = firstWindow.startMs - 3_000;
    await act(async () => clock(firstCueMs, firstCueMs));
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('4').closest('.game-scoreboard')).toBeInTheDocument();
    expect(state.playProps?.overlayControlsTop).toBe('53%');
    expect(state.playProps?.overlayControlsCentered).toBe(true);
    expect(state.playProps?.statusNoticeUnderScoreboard).toBe(true);
    expect(screen.queryByLabelText('Направления движения')).not.toBeInTheDocument();
    await act(async () => clock(firstWindow.targetMs, firstWindow.targetMs));
    expect(screen.getByText('Бросай')).toBeInTheDocument();
    expect(screen.getByText('Бросай').closest('.game-scoreboard')).toBeInTheDocument();
    const before = state.playProps?.clockRebaseKey;
    let window = firstWindow;
    for (let missed = 0; missed < 3; missed += 1) {
      await act(async () => (state.playProps?.onSceneClock as typeof clock)(
        window.endMs + 1, window.endMs + 1));
      expect(state.playProps?.clockRebaseKey).toBe(before);
      expect(state.playProps?.seed).toBe(movement.runSeed);
      expect(state.playProps?.initialSceneElapsedMs).toBe(0);
      window = findNextAdvancedTrainingWindow(movement, window.endMs + 1)!;
      await act(async () => (state.playProps?.onSceneClock as typeof clock)(
        window.startMs - 3_000,
        window.startMs - 3_000));
      expect(screen.getByText('4')).toBeInTheDocument();
    }
    await act(async () => clock(window.endMs + 1, window.endMs + 1));
    expect(screen.getByText(/Ожидаем\s+момент/)).toBeInTheDocument();
    expect(state.shot).not.toHaveBeenCalled();
  });

  it('names the goalie position rather than implying a shooting side', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    expect(state.playProps?.statusNotice).toBe('Упражнение "Вратарь рядом"\n(Слева от ворот)');
    expect(state.playProps?.practiceShotWindow).toEqual({
      armStartMs: firstWindow.startMs - 240,
      targetMs: firstWindow.targetMs,
      endMs: firstWindow.endMs,
    });
  });

  it.each([
    ['near_goalie', 'Вратарь рядом', 'Слева от ворот', 'Справа от ворот'],
    ['counter_direction', 'Противоход', 'Ты движешься влево', 'Ты движешься вправо'],
    ['complex', 'Сложный', 'Проход слева от вратаря', 'Проход справа от вратаря'],
    ['precise', 'Меткий', 'Проход слева от вратаря', 'Проход справа от вратаря'],
    ['behind_goalie', 'За вратаря', 'Ты движешься влево', 'Ты движешься вправо'],
    ['corner', 'Сложный в углу', 'У левого борта', 'У правого борта'],
    ['edge', 'На грани', 'Проход слева от вратаря', 'Проход справа от вратаря'],
    ['super_precise', 'Суперметкий', 'Проход слева от вратаря', 'Проход справа от вратаря'],
  ] as const)('shows the %s exercise name and side on separate lines', async (
    exerciseKey, title, left, right,
  ) => {
    for (const [side, detail] of [['left', left], ['right', right]] as const) {
      const selected = getAdvancedTrainingV2Scenario(exerciseKey, side, 'practice', 0);
      state.start.mockResolvedValue({ state: { ...run, exercise_key: exerciseKey, side,
        scenario: selected, scenario_id: selected.id, shot_index: 1,
        movement: { ...movement, technique: exerciseKey, side,
          runSeed: getAdvancedTrainingContinuousSeed(exerciseKey) } } });
      const view = render(<AdvancedTrainingPlayV2 exerciseKey={exerciseKey}
        onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
      await waitFor(() => expect(state.playProps?.active).toBe(true));
      expect(state.playProps?.statusNotice).toBe(`Упражнение "${title}"\n(${detail})`);
      view.unmount();
      state.playProps = null;
    }
  });

  it('clears a missed-moment notice after 1.5 seconds', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    vi.useFakeTimers();
    try {
      await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(
        firstWindow.endMs + 1));
      expect(state.playProps?.statusNotice).toBe('Момент прошёл. Попробуй ещё раз.');
      await act(async () => vi.advanceTimersByTime(1500));
      expect(state.playProps?.statusNotice).toBe('Упражнение "Вратарь рядом"\n(Слева от ворот)');
    } finally {
      vi.useRealTimers();
    }
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
    const resumeBefore = state.playProps?.resumeHeldResultKey;
    await act(async () => screen.getByRole('button', { name: 'Продолжить' }).click());
    expect(Number(state.playProps?.resumeHeldResultKey)).toBe(Number(resumeBefore) + 1);
    expect(state.playProps?.preserveSceneOnModalReturn).toBe(true);
  });

  it('shows an ordinary goal result before a separate coach explanation', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    state.shot.mockResolvedValue({ server_result: 'goal', success: false,
      actual_technique: 'ordinary', actual_side: 'left', measurements: null,
      feedback_code: 'wrong_category', stage_finished: false, completed: false,
      reward_granted: null, state: { ...run, shot_index: 2 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    await act(async () => (state.playProps?.onSceneClock as (sceneMs: number) => void)(
      firstWindow.targetMs));
    expect(screen.getByText('Бросай')).toBeInTheDocument();
    const response = await act(async () => {
      return (state.playProps?.submitShot as (args: Record<string, unknown>) => Promise<{
        resultPresentation: { title: string };
      }>)(
        { shotIndex: 1, input: { tapTime: scenario.targetTapTimeMs - 950 }, claimedResult: 'goal' });
    });
    expect(response.resultPresentation.title).toBe('Гол');
    expect(screen.queryByText('Бросай')).not.toBeInTheDocument();
    expect(String(state.playProps?.statusNotice)).not.toContain('Простой бросок');
    const resumeBefore = state.playProps?.resumeHeldResultKey;
    expect(state.playProps?.holdSceneAfterResult).toBe(true);
    await act(async () => (state.playProps?.onResultComplete as () => void)());
    expect(screen.getByText(/Простой бросок/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Понятно' })).toBeInTheDocument();
    expect(state.playProps?.overlayControlsTop).toBe('49%');
    expect(state.playProps?.overlayControlsCentered).toBe(true);
    expect(String(state.playProps?.statusNotice)).not.toContain('Простой бросок');
    expect(state.playProps?.primaryActionBlocked).toBe(true);
    expect(state.playProps?.resumeHeldResultKey).toBe(resumeBefore);
    await act(async () => screen.getByRole('button', { name: 'Понятно' }).click());
    expect(screen.queryByText(/Простой бросок/)).not.toBeInTheDocument();
    expect(Number(state.playProps?.resumeHeldResultKey)).toBe(Number(resumeBefore) + 1);
    expect(state.playProps?.primaryActionBlocked).toBe(false);
    expect(state.playProps?.goals).toBe(0);
  });

  it('clears a miss quickly but keeps the wrong-category explanation', async () => {
    state.start.mockResolvedValue({ state: { ...run, shot_index: 1 } });
    state.shot.mockResolvedValueOnce({ server_result: 'miss', success: false,
      actual_technique: null, actual_side: null, measurements: null,
      feedback_code: 'miss', stage_finished: false, completed: false,
      reward_granted: null, state: { ...run, shot_index: 2 } });
    render(<AdvancedTrainingPlayV2 exerciseKey="near_goalie"
      onBack={vi.fn()} onCourse={vi.fn()} onCatalogRefresh={vi.fn()} />);
    await waitFor(() => expect(state.playProps?.active).toBe(true));
    vi.useFakeTimers();
    try {
      await act(async () => {
        await (state.playProps?.submitShot as (args: Record<string, unknown>) => Promise<unknown>)(
          { shotIndex: 1, input: { tapTime: scenario.targetTapTimeMs - 950 }, claimedResult: 'miss' });
      });
      expect(state.playProps?.statusNotice).toBe('Упражнение "Вратарь рядом"\n(Слева от ворот)');
      await act(async () => (state.playProps?.onResultComplete as () => void)());
      expect(state.playProps?.statusNotice).toBe('Мимо: шайба не попала в ворота.');
      await act(async () => vi.advanceTimersByTime(1500));
      expect(state.playProps?.statusNotice).toBe('Упражнение "Вратарь рядом"\n(Слева от ворот)');

      state.shot.mockResolvedValueOnce({ server_result: 'goal', success: false,
        actual_technique: 'ordinary', actual_side: 'left', measurements: null,
        feedback_code: 'wrong_category', stage_finished: false, completed: false,
        reward_granted: null, state: { ...run, shot_index: 3 } });
      await act(async () => {
        await (state.playProps?.submitShot as (args: Record<string, unknown>) => Promise<unknown>)(
          { shotIndex: 2, input: { tapTime: scenario.targetTapTimeMs - 950 }, claimedResult: 'goal' });
      });
      expect(String(state.playProps?.statusNotice)).not.toContain('Простой бросок');
      await act(async () => (state.playProps?.onResultComplete as () => void)());
      expect(screen.getByText(/Простой бросок/)).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(5000));
      expect(screen.getByText(/Простой бросок/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
