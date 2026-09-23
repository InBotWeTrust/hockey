import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_VISUAL_X_CENTER,
  buildMarksmanshipReplaySnapshot,
  deriveShotSeed,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  projectManualMarksmanship,
  type ManualMarksmanshipInput,
  type MarksmanshipV4Technique,
} from '@hockey/game-core';
import { getConstructorScene, MarksmanshipConstructorCourt } from '../game/MarksmanshipConstructorCourt.js';
import './MarksmanshipConstructorScreen.css';

const STARTS = [
  { value: 'start-a', label: 'Начало 1' },
  { value: 'start-b', label: 'Начало 2' },
  { value: 'start-c', label: 'Начало 3' },
] as const;
const GOALIE = getGoalie('rookie');
const SPEEDS = getDailyPeriodSpeedPreset(1);
const STEP_MS = 50;
const MAX_TIME_MS = 10_000;
const TECHNIQUES: Record<MarksmanshipV4Technique, string> = {
  ordinary: 'Обычный гол',
  near_goalie: 'Рядом с вратарём',
  board_side: 'У борта',
  counter_direction: 'Против движения',
  precise: 'Точный просвет',
  behind_goalie: 'За спиной вратаря',
  super_precise: 'Сверхточный просвет',
};

function initialManual(seed: string, timeMs: number): ManualMarksmanshipInput {
  const scene = getConstructorScene(seed, timeMs, GOALIE, 1);
  const snapshot = buildMarksmanshipReplaySnapshot({
    shotInput: { tapTime: timeMs, shooterTapTime: timeMs,
      puckSpeedPerMs: SPEEDS.puckSpeedPerMs,
      shooterFrequency: SPEEDS.shooterFrequency,
      goalieFrequency: SPEEDS.goalieFrequency,
      goalFrequency: SPEEDS.goalFrequency },
    goalie: GOALIE,
    seed: deriveShotSeed(seed, 1, 1),
    shotIndex: 1,
    phaseOffsets: getSessionPhaseOffsets(seed),
    earliestTapTime: 0,
    scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  });
  return {
    playerX: scene.playerX,
    goalCenterX: PERSPECTIVE_COURT_VISUAL_X_CENTER +
      scene.goalOffsetX * PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
    goalieCenterX: PERSPECTIVE_COURT_VISUAL_X_CENTER +
      (scene.goalieState.position.x - PERSPECTIVE_COURT_VISUAL_X_CENTER) *
        PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
    goalWidth: snapshot.goalCross.goalHitbox.maxX - snapshot.goalCross.goalHitbox.minX,
    goalieWidth: snapshot.goalieCross.goalieHitbox.maxX - snapshot.goalieCross.goalieHitbox.minX,
  };
}

export function MarksmanshipConstructorScreen(): JSX.Element {
  const navigate = useNavigate();
  const [seed, setSeed] = useState<string>(STARTS[0].value);
  const [timeMs, setTimeMs] = useState(0);
  const [mode, setMode] = useState<'game' | 'manual'>('game');
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [manualInput, setManualInput] = useState<ManualMarksmanshipInput>(() =>
    initialManual(STARTS[0].value, 0));

  const projection = useMemo(() => projectManualMarksmanship(manualInput), [manualInput]);
  const snapshot = useMemo(() => buildMarksmanshipReplaySnapshot({
    shotInput: { tapTime: timeMs, shooterTapTime: timeMs,
      puckSpeedPerMs: SPEEDS.puckSpeedPerMs,
      shooterFrequency: SPEEDS.shooterFrequency,
      goalieFrequency: SPEEDS.goalieFrequency,
      goalFrequency: SPEEDS.goalFrequency },
    goalie: GOALIE,
    seed: deriveShotSeed(seed, 1, 1),
    shotIndex: 1,
    phaseOffsets: getSessionPhaseOffsets(seed),
    earliestTapTime: 0,
    scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  }), [seed, timeMs]);
  const result = mode === 'manual' ? projection.result : snapshot.classification.result.type;
  const technique = mode === 'game' ? snapshot.classification.v4Score?.technique : null;
  const points = mode === 'game' && result === 'goal'
    ? snapshot.classification.awardedPoints : null;
  const explanation = mode === 'manual'
    ? 'Ручная расстановка — очки не рассчитываются'
    : result === 'goal'
      ? `Признаки: ${technique ? TECHNIQUES[technique] : 'гол в створ'}`
      : snapshot.classification.opportunity === 'human_error'
        ? 'Момент был — попробуй другое время броска'
        : snapshot.classification.opportunity === 'too_short'
          ? 'Очень короткий момент'
          : 'Жди другого момента';
  const setClampedTime = (next: number) => setTimeMs(Math.max(0, Math.min(MAX_TIME_MS, next)));
  const changeManual = (field: keyof ManualMarksmanshipInput, value: number) => {
    if (!Number.isFinite(value)) return;
    setManualInput((current) => {
      const normalized = projectManualMarksmanship({ ...current, [field]: value });
      return { ...current, playerX: normalized.playerX,
        goalCenterX: normalized.goalCenterX, goalieCenterX: normalized.goalieCenterX };
    });
  };
  return (
    <main className="screen marksmanship-constructor-screen">
      <header className="marksmanship-constructor-header">
        <button type="button" className="btn btn--ghost" aria-label="Назад в профиль"
          onClick={() => navigate('/profile')}>Назад</button>
        <h1>Конструктор меткости</h1>
      </header>
      <section className="marksmanship-constructor-stage" aria-label="Ситуация на площадке"
        onWheel={(event) => {
          if (mode !== 'game') return;
          setClampedTime(timeMs + (event.deltaY > 0 ? STEP_MS : -STEP_MS));
        }}>
        <div className="marksmanship-constructor-court-wrap">
          <MarksmanshipConstructorCourt seed={seed} timeMs={timeMs} goalie={GOALIE}
            shotIndex={1} showHitboxes={showHitboxes}
            manual={mode === 'manual' ? projection : null}
            {...(mode === 'manual' ? { onDragCenter: (entity: 'player' | 'goal' | 'goalie', x: number) =>
              changeManual(entity === 'player' ? 'playerX' : entity === 'goal'
                ? 'goalCenterX' : 'goalieCenterX', x) } : {})} />
          <div className="marksmanship-constructor-result" aria-label="Результат броска">
            <div className="marksmanship-constructor-result__top">
              <strong>{result === 'goal' ? 'ГОЛ' : result === 'save' ? 'СЕЙВ' : 'МИМО'}</strong>
              {points !== null && <span>+{points}</span>}
            </div>
            <p>{explanation}</p>
          </div>
        </div>
      </section>
      <section className="marksmanship-constructor-controls" aria-label="Настройки ситуации">
        <div className="marksmanship-constructor-row">
          <button type="button" aria-pressed={mode === 'game'}
            onClick={() => setMode('game')}>Игровая попытка</button>
          <button type="button" aria-pressed={mode === 'manual'}
            onClick={() => { setManualInput(initialManual(seed, timeMs)); setMode('manual'); }}>
            Ручная расстановка</button>
          <button type="button" aria-label={`Хитбоксы: ${showHitboxes ? 'вкл' : 'выкл'}`}
            aria-pressed={showHitboxes} onClick={() => setShowHitboxes(!showHitboxes)}>
            Хитбоксы</button>
        </div>
        {mode === 'game' ? (
          <>
            <div className="marksmanship-constructor-row">
              <label>Начало игры
                <select value={seed} onChange={(event) => {
                  setSeed(event.target.value);
                  setTimeMs(0);
                }}>
                  {STARTS.map((start) => <option key={start.value} value={start.value}>{start.label}</option>)}
                </select>
              </label>
              <button type="button" aria-label="Назад" onClick={() => setClampedTime(timeMs - STEP_MS)}>←</button>
              <button type="button" aria-label="Вперёд" onClick={() => setClampedTime(timeMs + STEP_MS)}>→</button>
              <button type="button" onClick={() => setTimeMs(0)}>Сбросить</button>
            </div>
            <div className="marksmanship-constructor-row marksmanship-constructor-time">
              <label>Время сцены
                <input type="range" min={0} max={MAX_TIME_MS} step={10} value={timeMs}
                  onChange={(event) => setClampedTime(Number(event.target.value))} />
              </label>
              <output>{(timeMs / 1000).toFixed(2)} с</output>
            </div>
          </>
        ) : (
          <div className="marksmanship-constructor-coordinates">
            <label>X линии броска игрока
              <input type="number" value={Math.round(projection.playerX * 10) / 10}
                onChange={(event) => changeManual('playerX', Number(event.target.value))} />
            </label>
            <label>Центр хитбокса ворот
              <input type="number" value={Math.round(projection.goalCenterX * 10) / 10}
                onChange={(event) => changeManual('goalCenterX', Number(event.target.value))} />
            </label>
            <label>Центр хитбокса вратаря
              <input type="number" value={Math.round(projection.goalieCenterX * 10) / 10}
                onChange={(event) => changeManual('goalieCenterX', Number(event.target.value))} />
            </label>
            <button type="button" onClick={() => { setTimeMs(0); setMode('game'); }}>Сбросить</button>
          </div>
        )}
        <button type="button" className="marksmanship-constructor-details-toggle"
          aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}>
          Характеристики ситуации</button>
        {detailsOpen && (
          <div className="marksmanship-constructor-details">
            <span>Игрок X: {mode === 'manual' ? projection.playerX.toFixed(1) : snapshot.tap.playerX.toFixed(1)}</span>
            <span>Ворота: {(mode === 'manual' ? projection.goalHitbox : snapshot.goalCross.goalHitbox).minX.toFixed(1)}–{(mode === 'manual' ? projection.goalHitbox : snapshot.goalCross.goalHitbox).maxX.toFixed(1)}</span>
            <span>Вратарь: {(mode === 'manual' ? projection.goalieHitbox : snapshot.goalieCross.goalieHitbox).minX.toFixed(1)}–{(mode === 'manual' ? projection.goalieHitbox : snapshot.goalieCross.goalieHitbox).maxX.toFixed(1)}</span>
            {mode === 'game' && <span>Проверка вратаря: {snapshot.goalieCross.timeMs.toFixed(0)} мс · ворот: {snapshot.goalCross.timeMs.toFixed(0)} мс</span>}
            <span>Контур игрока — визуальный габарит; бросок считается по одной линии X.</span>
          </div>
        )}
      </section>
    </main>
  );
}
