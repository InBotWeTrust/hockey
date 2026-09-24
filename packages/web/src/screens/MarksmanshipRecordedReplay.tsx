import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import {
  STICK_NEUTRAL,
  getGoalie,
  getPerspectiveCourtGoalOpening,
  getPerspectiveCourtGoalieHitbox,
  simulateShooter,
} from '@hockey/game-core';
import { MarksmanshipConstructorCourt } from '../game/MarksmanshipConstructorCourt.js';
import type { RecordedResult, RecordedRun } from './marksmanshipReplayData.js';
import {
  REPLAY_DURATION_MS,
  REPLAY_RESULT_VISIBLE_MS,
  formatReplayTime,
  getReplayFrame,
  seekReplayTime,
} from './marksmanshipReplayTimeline.js';

const DEFAULT_STEP_MS = 50;

function resultLabel(result: RecordedResult): string {
  return result === 'goal' ? 'ГОЛ' : result === 'save' ? 'СЭЙВ' : 'МИМО';
}

export function MarksmanshipRecordedReplay({ run }: { run: RecordedRun }): JSX.Element {
  const stageRef = useRef<HTMLElement>(null);
  const [wallMs, setWallMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [stepInput, setStepInput] = useState(String(DEFAULT_STEP_MS));
  const frame = useMemo(() => getReplayFrame(run, wallMs), [run, wallMs]);
  const goalie = useMemo(() => getGoalie(run.goalieId), [run.goalieId]);
  const goals = useMemo(() => run.shots.filter((shot) => shot.result === 'goal'), [run]);
  const stepMs = Math.max(1, Math.min(REPLAY_DURATION_MS,
    Math.round(Number(stepInput) || DEFAULT_STEP_MS)));

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let animationFrame = 0;
    const tick = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      setWallMs((previous) => seekReplayTime(previous, delta));
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing, run.key]);

  useEffect(() => {
    if (wallMs >= REPLAY_DURATION_MS && playing) setPlaying(false);
  }, [wallMs, playing]);

  const seek = (next: number) => {
    setPlaying(false);
    setWallMs(seekReplayTime(next, 0));
  };
  const selectedShot = frame.shot ?? frame.anchor;
  const selectedPlayerX = selectedShot ? simulateShooter(
    selectedShot.shooterMs + run.phaseOffsets.shooter,
    selectedShot.input.shooterFrequency,
  ).x : null;
  const selectedGoal = selectedShot ? getPerspectiveCourtGoalOpening(
    selectedShot.input, goalie, run.phaseOffsets,
  ) : null;
  const selectedGoalie = selectedShot ? getPerspectiveCourtGoalieHitbox(
    selectedShot.input, goalie, selectedShot.seed, selectedShot.index,
    { ...STICK_NEUTRAL, shotZoneMultiplier: run.stickZoneMultiplier }, run.phaseOffsets,
  ) : null;
  const showResult = frame.phase === 'result' && frame.shot !== null &&
    frame.resultElapsedMs < REPLAY_RESULT_VISIBLE_MS;

  return <>
    <div className="marksmanship-constructor-row marksmanship-constructor-primary-controls">
      <button type="button" aria-label={`Хитбоксы: ${showHitboxes ? 'вкл' : 'выкл'}`}
        aria-pressed={showHitboxes} onClick={() => setShowHitboxes((current) => !current)}>
        Хитбоксы</button>
      <button type="button" onClick={() => seek(0)}>Сбросить повтор</button>
    </div>
    <section ref={stageRef} className="marksmanship-constructor-stage"
      aria-label="Ситуация на площадке">
      <div className="marksmanship-constructor-court-wrap">
        <MarksmanshipConstructorCourt seed={run.key} timeMs={frame.sceneMs}
          goalie={goalie} shotIndex={selectedShot?.index ?? 1}
          showHitboxes={showHitboxes} replay={{ run, frame }} />
        {showResult && <div className={`marksmanship-constructor-result marksmanship-constructor-result--${frame.shot!.result}`}
          aria-label="Результат записанного броска">
          <div className="marksmanship-constructor-result__top">
            <strong>{resultLabel(frame.shot!.result)}</strong>
          </div>
        </div>}
      </div>
    </section>
    <section className="marksmanship-constructor-controls" aria-label="Управление повтором">
      <div className="marksmanship-constructor-row marksmanship-constructor-playback">
        <button type="button" onClick={() => {
          if (wallMs >= REPLAY_DURATION_MS) setWallMs(0);
          setPlaying((current) => !current);
        }} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? 'Пауза' : 'Воспроизвести'}</button>
      </div>
      <div className="marksmanship-constructor-row marksmanship-constructor-steps">
        <button type="button" className="marksmanship-constructor-step" aria-label="Назад"
          onClick={() => seek(wallMs - stepMs)}>←</button>
        <label className="marksmanship-constructor-step-input">Шаг, мс
          <input type="number" min={1} max={REPLAY_DURATION_MS} step={1} value={stepInput}
            onChange={(event) => setStepInput(event.target.value)}
            onBlur={() => setStepInput(String(stepMs))} />
        </label>
        <button type="button" className="marksmanship-constructor-step" aria-label="Вперёд"
          onClick={() => seek(wallMs + stepMs)}>→</button>
      </div>
      <div className="marksmanship-constructor-row marksmanship-constructor-time">
        <div className="marksmanship-constructor-time__heading">
          <label htmlFor="recorded-replay-time">Время повтора</label>
          <output htmlFor="recorded-replay-time">{formatReplayTime(wallMs)} / 03:00.00</output>
        </div>
        <input id="recorded-replay-time" type="range" min={0} max={REPLAY_DURATION_MS}
          step={1} value={wallMs} onChange={(event) => seek(Number(event.target.value))} />
      </div>
      <p className="marksmanship-replay-note">Реконструкция игры: моменты и результаты бросков записаны,
        движение между ними приблизительное.</p>
      <section className="marksmanship-constructor-details" aria-label="Характеристики записанного броска">
        {selectedShot ? <div className="marksmanship-constructor-details__grid">
          <span><strong className="marksmanship-constructor-detail-label">Бросок №:</strong> {selectedShot.index}</span>
          <span><strong className="marksmanship-constructor-detail-label">Результат:</strong> {resultLabel(selectedShot.result)}</span>
          <span><strong className="marksmanship-constructor-detail-label">Время нажатия:</strong> {formatReplayTime(selectedShot.wallMs)}</span>
          <span><strong className="marksmanship-constructor-detail-label">Часы сцены:</strong> {formatReplayTime(selectedShot.sceneMs)}</span>
          <span><strong className="marksmanship-constructor-detail-label">Часы игрока:</strong> {formatReplayTime(selectedShot.shooterMs)}</span>
          <span><strong className="marksmanship-constructor-detail-label">Игрок X:</strong> {selectedPlayerX?.toFixed(1)}</span>
          <span><strong className="marksmanship-constructor-detail-label">Ворота при прилёте:</strong> {selectedGoal?.xMin.toFixed(1)}–{selectedGoal?.xMax.toFixed(1)}</span>
          <span><strong className="marksmanship-constructor-detail-label">Вратарь при встрече:</strong> {selectedGoalie?.xMin.toFixed(1)}–{selectedGoalie?.xMax.toFixed(1)}</span>
        </div> : <p>Нажми «Плей» или выбери гол ниже, чтобы увидеть записанный бросок.</p>}
      </section>
      <section className="marksmanship-constructor-episodes" aria-label="Голевые ситуации">
        <h2>Записанные голы — {goals.length}</h2>
        <ol aria-label="Записанные голы">{goals.map((shot, index) => <li key={shot.index}>
          <div className="marksmanship-constructor-episodes__copy">
            <div><strong>Гол №{index + 1}</strong> · бросок {shot.index} · {formatReplayTime(shot.wallMs)}</div>
          </div>
          <button type="button" className="marksmanship-constructor-episodes__jump"
            aria-label={`Показать гол №${index + 1} на площадке`}
            title={`Показать гол №${index + 1} на площадке`}
            onClick={() => { seek(shot.wallMs);
              stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            <ArrowUp size={20} aria-hidden="true" />
          </button>
        </li>)}</ol>
      </section>
    </section>
  </>;
}
