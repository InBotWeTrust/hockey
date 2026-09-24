import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
  buildMarksmanshipReplaySnapshot,
  classifyMarksmanshipShot,
  deriveShotSeed,
  getDailyPeriodSpeedPreset,
  getGoalie,
  getSessionPhaseOffsets,
  type MarksmanshipV4Technique,
} from '@hockey/game-core';
import { MarksmanshipConstructorCourt } from '../game/MarksmanshipConstructorCourt.js';
import { MarksmanshipRecordedReplay } from './MarksmanshipRecordedReplay.js';
import { RECORDED_RUNS } from './marksmanshipReplayData.js';
import { groupGoalEpisodes, type GoalEpisode, type GoalSample } from './marksmanshipGoalEpisodes.js';
import './MarksmanshipConstructorScreen.css';

const STARTS = [
  { value: 'start-a', label: 'Начало 1' },
  { value: 'start-b', label: 'Начало 2' },
  { value: 'start-c', label: 'Начало 3' },
] as const;
const GOALIE = getGoalie('rookie');
const SPEEDS = getDailyPeriodSpeedPreset(1);
const DEFAULT_STEP_MS = 50;
const MAX_TIME_MS = 180_000;
const SCAN_STEP_MS = 10;
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
  const topRef = useRef<HTMLElement>(null);
  const [seed, setSeed] = useState<string>(STARTS[0].value);
  const [preStart, setPreStart] = useState(true);
  const [timeMs, setTimeMs] = useState(0);
  const [stepInput, setStepInput] = useState(String(DEFAULT_STEP_MS));
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [episodes, setEpisodes] = useState<GoalEpisode[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [techniqueFilter, setTechniqueFilter] = useState<'all' | MarksmanshipV4Technique>('all');
  const [selectedTab, setSelectedTab] = useState('synthetic');

  useEffect(() => {
    if (preStart) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const samples: GoalSample[] = [];
    const phaseOffsets = getSessionPhaseOffsets(seed);
    const shotSeed = deriveShotSeed(seed, 1, 1);
    let nextTime = 0;
    setEpisodes([]);
    setIsScanning(true);
    const scan = () => {
      const stop = Math.min(MAX_TIME_MS, nextTime + SCAN_STEP_MS * 99);
      for (; nextTime <= stop; nextTime += SCAN_STEP_MS) {
        const classification = classifyMarksmanshipShot({
          shotInput: { tapTime: nextTime, shooterTapTime: nextTime,
            puckSpeedPerMs: SPEEDS.puckSpeedPerMs,
            shooterFrequency: SPEEDS.shooterFrequency,
            goalieFrequency: SPEEDS.goalieFrequency,
            goalFrequency: SPEEDS.goalFrequency },
          goalie: GOALIE, seed: shotSeed, shotIndex: 1, phaseOffsets,
          earliestTapTime: 0, scoring: DEFAULT_MARKSMANSHIP_V4_SCORING_RULES,
        });
        samples.push({ timeMs: nextTime,
          points: classification.result.type === 'goal' ? classification.awardedPoints : 0,
          technique: classification.v4Score?.technique ?? null });
      }
      if (cancelled) return;
      if (nextTime <= MAX_TIME_MS) timer = setTimeout(scan, 0);
      else { setEpisodes(groupGoalEpisodes(samples)); setIsScanning(false); }
    };
    timer = setTimeout(scan, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [seed, preStart]);

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
  const episodeIndex = result === 'goal'
    ? episodes.findIndex((episode) => timeMs >= episode.startMs - SCAN_STEP_MS &&
        timeMs <= episode.endMs + SCAN_STEP_MS) : -1;
  const visibleEpisodes = episodes.map((episode, index) => ({ episode, index }))
    .filter(({ episode }) => techniqueFilter === 'all' || episode.technique === techniqueFilter);
  const explanation = result === 'goal'
      ? `Признаки: ${technique ? TECHNIQUES[technique] : 'гол в створ'}`
      : snapshot.classification.opportunity === 'human_error'
        ? 'Момент был — попробуй другое время броска'
        : snapshot.classification.opportunity === 'too_short'
          ? 'Очень короткий момент'
          : 'Жди другого момента';
  const setClampedTime = (next: number) => {
    setPreStart(false);
    setTimeMs(Math.max(0, Math.min(MAX_TIME_MS, next)));
  };
  const stepMs = Math.max(1, Math.min(MAX_TIME_MS, Math.round(Number(stepInput) || DEFAULT_STEP_MS)));
  const timeLabel = `${String(Math.floor(timeMs / 60_000)).padStart(2, '0')}:${String(Math.floor(timeMs % 60_000 / 1000)).padStart(2, '0')}.${String(Math.floor(timeMs % 1000 / 10)).padStart(2, '0')}`;
  return (
    <main className="screen marksmanship-constructor-screen">
      <header ref={topRef} className="marksmanship-constructor-header page-header-standard">
        <button type="button" className="icon-btn page-header-standard__back" aria-label="Назад в профиль"
          onClick={() => navigate('/profile')}><ArrowLeft size={18} /></button>
        <h1 className="page-header-standard__title">Конструктор меткости</h1>
      </header>
      <nav className="marksmanship-replay-tabs" role="tablist" aria-label="Режим конструктора">
        {[{ key: 'synthetic', label: 'Учебная схема' }, ...RECORDED_RUNS].map((tab) => (
          <button type="button" key={tab.key} role="tab"
            aria-selected={selectedTab === tab.key}
            onClick={() => setSelectedTab(tab.key)}>{tab.label}</button>
        ))}
      </nav>
      {selectedTab === 'synthetic' ? <>
      <div className="marksmanship-constructor-row marksmanship-constructor-primary-controls">
        <button type="button" aria-label={`Хитбоксы: ${showHitboxes ? 'вкл' : 'выкл'}`}
          aria-pressed={showHitboxes} onClick={() => setShowHitboxes(!showHitboxes)}>
          Хитбоксы</button>
        <select aria-label="Начало игры" value={preStart ? 'pre-start' : seed} onChange={(event) => {
          if (event.target.value === 'pre-start') {
            setPreStart(true);
          } else {
            setSeed(event.target.value);
            setPreStart(false);
          }
          setTimeMs(0);
        }}>
          <option value="pre-start">До старта</option>
          {STARTS.map((start) => <option key={start.value} value={start.value}>{start.label}</option>)}
        </select>
        <button type="button" onClick={() => { setPreStart(true); setTimeMs(0); }}>Сбросить</button>
      </div>
      <section className="marksmanship-constructor-stage" aria-label="Ситуация на площадке"
        onWheel={(event) => {
          setClampedTime(timeMs + (event.deltaY > 0 ? stepMs : -stepMs));
        }}>
        <div className="marksmanship-constructor-court-wrap">
          <MarksmanshipConstructorCourt seed={seed} timeMs={timeMs} goalie={GOALIE}
            shotIndex={1} showHitboxes={showHitboxes} preStart={preStart} />
          {!preStart && <div className={`marksmanship-constructor-result marksmanship-constructor-result--${result}`}
            aria-label="Результат броска">
            <div className="marksmanship-constructor-result__top">
              <strong>{result === 'goal' ? 'ГОЛ' : result === 'save' ? 'СЭЙВ' : 'МИМО'}</strong>
            </div>
          </div>}
        </div>
      </section>
      <section className="marksmanship-constructor-controls" aria-label="Настройки ситуации">
        <div className="marksmanship-constructor-row marksmanship-constructor-steps">
          <button type="button" className="marksmanship-constructor-step" aria-label="Назад"
            onClick={() => setClampedTime(timeMs - stepMs)}>←</button>
          <label className="marksmanship-constructor-step-input">Шаг, мс
            <input type="number" min={1} max={MAX_TIME_MS} step={1} value={stepInput}
              onChange={(event) => setStepInput(event.target.value)}
              onBlur={() => setStepInput(String(stepMs))} />
          </label>
          <button type="button" className="marksmanship-constructor-step" aria-label="Вперёд"
            onClick={() => setClampedTime(timeMs + stepMs)}>→</button>
        </div>
        <div className="marksmanship-constructor-row marksmanship-constructor-time">
          <div className="marksmanship-constructor-time__heading"><label htmlFor="constructor-time">Время сцены</label>
            <output htmlFor="constructor-time">{preStart ? 'ДО СТАРТА' : timeLabel}</output></div>
          <input id="constructor-time" type="range" min={0} max={MAX_TIME_MS} step={10} value={timeMs}
            onChange={(event) => setClampedTime(Number(event.target.value))} />
        </div>
        {!preStart && <section className="marksmanship-constructor-details" aria-label="Характеристики ситуации">
          <div className="marksmanship-constructor-details__grid">
            <span className="marksmanship-constructor-points-row"><strong className="marksmanship-constructor-detail-label">Очки за бросок:</strong>{' '}
              <span className="marksmanship-constructor-points">{points !== null ? `+${points}` : '0'}</span></span>
            {result === 'goal' && episodeIndex >= 0 && <span><strong className="marksmanship-constructor-detail-label">Гол №:</strong> {episodeIndex + 1}</span>}
            <span>{explanation}</span>
            <span><strong className="marksmanship-constructor-detail-label">Игрок X:</strong> {snapshot.tap.playerX.toFixed(1)}</span>
            <span><strong className="marksmanship-constructor-detail-label">Ворота при прилёте:</strong> {snapshot.goalCross.goalHitbox.minX.toFixed(1)}–{snapshot.goalCross.goalHitbox.maxX.toFixed(1)}</span>
            <span><strong className="marksmanship-constructor-detail-label">Вратарь:</strong> {snapshot.goalieCross.goalieHitbox.minX.toFixed(1)}–{snapshot.goalieCross.goalieHitbox.maxX.toFixed(1)}</span>
            <span><strong className="marksmanship-constructor-detail-label">Проверка вратаря:</strong> {snapshot.goalieCross.timeMs.toFixed(0)} мс</span>
            <span><strong className="marksmanship-constructor-detail-label">Проверка ворот:</strong> {snapshot.goalCross.timeMs.toFixed(0)} мс</span>
            <span>Контур игрока — визуальный габарит; бросок считается по одной линии X.</span>
          </div>
        </section>}
        {!preStart && <section className="marksmanship-constructor-episodes" aria-label="Голевые ситуации">
          <h2>Голевые ситуации — {STARTS.find((start) => start.value === seed)?.label}</h2>
          <select aria-label="Фильтр ситуаций" value={techniqueFilter}
            onChange={(event) => setTechniqueFilter(event.target.value as 'all' | MarksmanshipV4Technique)}>
            <option value="all">Все ситуации</option>
            {(Object.entries(TECHNIQUES) as [MarksmanshipV4Technique, string][]).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}
          </select>
          {isScanning ? <p>Ищем голевые моменты…</p> : visibleEpisodes.length === 0 ?
            <p>{episodes.length === 0 ? 'Голевых моментов не найдено.' : 'Нет голов этого типа.'}</p> :
            <ol>{visibleEpisodes.map(({ episode, index }) => <li key={episode.startMs}>
              <div className="marksmanship-constructor-episodes__copy">
                <div><strong>Гол №{index + 1}</strong> · {formatTime(episode.timeMs)} · +{episode.points} очков</div>
                <p>{episode.technique ? TECHNIQUES[episode.technique as MarksmanshipV4Technique] : 'Гол в створ'}</p>
              </div>
              <button type="button" onClick={() => {
                setClampedTime(episode.timeMs);
                topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }} className="marksmanship-constructor-episodes__jump"
              aria-label={`Показать гол №${index + 1} на площадке`}
              title={`Показать гол №${index + 1} на площадке`}><ArrowUp size={20} aria-hidden="true" /></button>
            </li>)}</ol>}
        </section>}
      </section>
      </> : <MarksmanshipRecordedReplay key={selectedTab}
        run={RECORDED_RUNS.find((run) => run.key === selectedTab)!} />}
    </main>
  );
}

function formatTime(timeMs: number): string {
  return `${String(Math.floor(timeMs / 60_000)).padStart(2, '0')}:${String(Math.floor(timeMs % 60_000 / 1000)).padStart(2, '0')}.${String(Math.floor(timeMs % 1000 / 10)).padStart(2, '0')}`;
}
