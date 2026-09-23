import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  buildMarksmanshipReplaySnapshot,
  deriveShotSeed,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  type MarksmanshipV4Technique,
} from '@hockey/game-core';
import { MarksmanshipConstructorCourt } from '../game/MarksmanshipConstructorCourt.js';
import './MarksmanshipConstructorScreen.css';

const STARTS = [
  { value: 'start-a', label: 'Начало 1' },
  { value: 'start-b', label: 'Начало 2' },
  { value: 'start-c', label: 'Начало 3' },
] as const;
const GOALIE = getGoalie('rookie');
const SPEEDS = getDailyPeriodSpeedPreset(1);
const STEP_MS = 50;
const MAX_TIME_MS = 180_000;
const TECHNIQUES: Record<MarksmanshipV4Technique, string> = {
  ordinary: 'Обычный гол',
  near_goalie: 'Рядом с вратарём',
  board_side: 'У борта',
  counter_direction: 'Против движения',
  precise: 'Точный просвет',
  behind_goalie: 'За спиной вратаря',
  super_precise: 'Сверхточный просвет',
};

export function MarksmanshipConstructorScreen(): JSX.Element {
  const navigate = useNavigate();
  const [seed, setSeed] = useState<string>(STARTS[0].value);
  const [timeMs, setTimeMs] = useState(0);
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  const result = snapshot.classification.result.type;
  const technique = snapshot.classification.v4Score?.technique;
  const points = result === 'goal' ? snapshot.classification.awardedPoints : null;
  const explanation = result === 'goal'
      ? `Признаки: ${technique ? TECHNIQUES[technique] : 'гол в створ'}`
      : snapshot.classification.opportunity === 'human_error'
        ? 'Момент был — попробуй другое время броска'
        : snapshot.classification.opportunity === 'too_short'
          ? 'Очень короткий момент'
          : 'Жди другого момента';
  const setClampedTime = (next: number) => setTimeMs(Math.max(0, Math.min(MAX_TIME_MS, next)));
  const timeLabel = `${String(Math.floor(timeMs / 60_000)).padStart(2, '0')}:${String(Math.floor(timeMs % 60_000 / 1000)).padStart(2, '0')}.${String(Math.floor(timeMs % 1000 / 10)).padStart(2, '0')}`;
  return (
    <main className="screen marksmanship-constructor-screen">
      <header className="marksmanship-constructor-header">
        <button type="button" className="btn btn--ghost" aria-label="Назад в профиль"
          onClick={() => navigate('/profile')}>Назад</button>
        <h1>Конструктор меткости</h1>
      </header>
      <section className="marksmanship-constructor-stage" aria-label="Ситуация на площадке"
        onWheel={(event) => {
          setClampedTime(timeMs + (event.deltaY > 0 ? STEP_MS : -STEP_MS));
        }}>
        <div className="marksmanship-constructor-court-wrap">
          <MarksmanshipConstructorCourt seed={seed} timeMs={timeMs} goalie={GOALIE}
            shotIndex={1} showHitboxes={showHitboxes} />
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
          <button type="button" aria-label={`Хитбоксы: ${showHitboxes ? 'вкл' : 'выкл'}`}
            aria-pressed={showHitboxes} onClick={() => setShowHitboxes(!showHitboxes)}>
            Хитбоксы</button>
        </div>
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
          <output>{timeLabel}</output>
        </div>
        <button type="button" className="marksmanship-constructor-details-toggle"
          aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}>
          Характеристики ситуации</button>
        {detailsOpen && (
          <div className="marksmanship-constructor-details">
            <span>Игрок X: {snapshot.tap.playerX.toFixed(1)}</span>
            <span>Ворота при прилёте: {snapshot.goalCross.goalHitbox.minX.toFixed(1)}–{snapshot.goalCross.goalHitbox.maxX.toFixed(1)}</span>
            <span>Вратарь: {snapshot.goalieCross.goalieHitbox.minX.toFixed(1)}–{snapshot.goalieCross.goalieHitbox.maxX.toFixed(1)}</span>
            <span>Проверка вратаря: {snapshot.goalieCross.timeMs.toFixed(0)} мс · ворот: {snapshot.goalCross.timeMs.toFixed(0)} мс</span>
            <span>Контур игрока — визуальный габарит; бросок считается по одной линии X.</span>
          </div>
        )}
      </section>
    </main>
  );
}
