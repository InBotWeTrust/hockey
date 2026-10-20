// Synthetic frontend-only fixture. No API requests, auth mutations or catalog activation.
import { activeWind, beachWindClock, beachWindMotion, createWindSchedule } from './beachWind.js';
import { createBeachCleanup } from './beachCleanup.js';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getBonusChallengeCondition,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE, PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE, type BonusChallengeEnvironmentRules } from '@hockey/game-core';
import { PlayView } from '../src/game/PlayView.js';
import '../src/app/global.css';
import '../src/app/design-system.css';

const rules: BonusChallengeEnvironmentRules = {
  baseModifiers: { goalMultiplier: 1, goalieMultiplier: 1, shooterMultiplier: .9, puckSpeedMultiplier: .9, label: 'Лёд тает' },
  fatigue: { slowdownStartMs: 8000, heavyStartMs: 18000, stopStartMs: 30000, stopDurationMs: 4000,
    recoveryDurationMs: 8000, slowMultiplier: .85, heavyMultiplier: .65 },
  stumbleWindows: [25000, 49000, 70000, 89000, 106000, 122000, 137000].map(startMs => ({ startMs, durationMs: 700 })),
  beach: { version: 1, meltDurationMs: 150000, finalSpeedMultiplier: .75 / .9, puddles: [
    { id: 'left', x: 145, y: 325, radiusX: 58, radiusY: 45, deepRatio: .5, speedMultiplier: .65, warningMs: 0, activeMs: 3000, fullMs: 33000, initialScale: .25 },
    { id: 'right', x: 430, y: 205, radiusX: 50, radiusY: 38, deepRatio: .5, speedMultiplier: .65, warningMs: 5000, activeMs: 8000, fullMs: 38000, initialScale: .25 },
    { id: 'upper-left', x: 120, y: 165, radiusX: 43, radiusY: 32, deepRatio: .5, speedMultiplier: .65, warningMs: 10000, activeMs: 13000, fullMs: 43000, initialScale: .25 },
    { id: 'middle-right', x: 455, y: 355, radiusX: 48, radiusY: 36, deepRatio: .5, speedMultiplier: .65, warningMs: 15000, activeMs: 18000, fullMs: 48000, initialScale: .25 },
    { id: 'center', x: 290, y: 455, radiusX: 60, radiusY: 40, deepRatio: .5, speedMultiplier: .65, warningMs: 20000, activeMs: 23000, fullMs: 53000, initialScale: .25 },
    { id: 'upper-center', x: 280, y: 260, radiusX: 42, radiusY: 30, deepRatio: .5, speedMultiplier: .65, warningMs: 25000, activeMs: 28000, fullMs: 58000, initialScale: .25 },
    { id: 'lower-left', x: 105, y: 480, radiusX: 45, radiusY: 34, deepRatio: .5, speedMultiplier: .65, warningMs: 30000, activeMs: 33000, fullMs: 63000, initialScale: .25 },
  ] },
};
const speeds = { goalFreq: .5, goalieFreq: .6, shooterFreq: .75, puckSpeed: 1.25 };
const goalie = { id: 'fixture-beach', name: 'Пляж', pattern: 'linear' as const, hp: 0, baseReward: 0,
  firstClearBonus: 0, speed: 0, amplitude: 1, frequency: .6, goalAmplitude: 220, goalFrequency: .5 };
function Fixture() {
  const [start, setStart] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [windSeed, setWindSeed] = useState(() => Math.floor(Math.random() * 0xffffffff));
  const [delay, setDelay] = useState(false);
  const [shots, setShots] = useState(0);
  const [goals, setGoals] = useState(0);
  const [done, setDone] = useState(false);
  const localRules = useMemo(() => structuredClone(rules), [epoch]);
  const cleanWater = useMemo(() => createBeachCleanup(localRules.beach!.puddles), [localRules]);
  const endsAt = useMemo(() => Date.now() + 150000 - start, [epoch, start]);
  const windSchedule = useMemo(() => createWindSchedule(windSeed, 150000), [windSeed]);
  const sample = useMemo(() => (time: number, pauses: Parameters<typeof beachWindMotion>[3]) =>
    beachWindMotion(localRules, time, speeds.shooterFreq, pauses, windSchedule), [localRules, windSchedule]);
  return <>
    <PlayView key={epoch} suppressedByModal={done} showIceCar={false} onBack={() => setDone(false)}
      active={!done} seed="beach-local-fixture-v1" goalieId={null} goalieConfig={goalie} periodNumber={1} periodsTotal={1}
      periodEndsAt={endsAt} onTimerExpired={() => setDone(true)}
      speedOverrides={speeds} initialSceneElapsedMs={start} initialShooterElapsedMs={start}
      shooterMotionTime={sample}
      courtMotionTime={(target, time) => beachWindClock(windSchedule, target, time)}
      beachWindTarget={time => activeWind(windSchedule, time)?.target ?? null} beachEnvironment={localRules.beach} onBeachWaterTap={cleanWater} beachCleanupHint
      duelCondition={(elapsed, activeSpeeds, reusable) => {
        const condition = getBonusChallengeCondition(localRules, elapsed, reusable);
        condition.puckSpeedDelta = activeSpeeds.puckSpeed * (condition.puckSpeedMultiplier - 1);
        return condition;
      }}
      goalieOptions={{ visualYScale: PERSPECTIVE_COURT_VISUAL_Y_SCALE,
        visualYOffset: PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET, visualXScale: PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
        sizeScale: 1.134, idleSizeScale: 1.22, saveSizeScale: .96, saveVisualYOffset: 10,
        idleSpriteUrl: '/bonus-games/goalkeepers/beach-ready.webp', saveSpriteUrl: '/bonus-games/goalkeepers/beach-save.webp' }}
      longCourtBackground="/bonus-games/arenas/beach.webp" rinkBorderRadius={28}
      statusNotice="Локальный тестовый профиль" statusNoticeClassName="bonus-challenge-environment-notice" statusNoticeUnderScoreboard
      goals={goals} shots={shots} shotIndexBase={shots} scoreboardNotice="Цель: 25 голов"
      waitForShotResponseBeforeResultClose
      optimisticAddShot={result => { setShots(n => n + 1); if (result === 'goal') setGoals(n => n + 1); }}
      submitShot={async ({ claimedResult }) => {
        if (delay) await new Promise(resolve => setTimeout(resolve, 2500));
        return { serverResult: claimedResult, state: null };
      }}
      applyState={() => { if (goals >= 25) setDone(true); }} />
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 8, background: '#e6f1fb', zIndex: 500,
      fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <strong>{done ? "Тест завершён · " : ""}Локальная фикстура · без сервера · баланс кандидат</strong>
      {[0, 25000, 32000, 65000, 115000].map(time => <button key={time} onClick={() => {
        if (time === 0) setWindSeed(Math.floor(Math.random() * 0xffffffff));
        setStart(time); setShots(0); setGoals(0); setDone(false); setEpoch(n => n + 1);
      }}>{time / 1000} с</button>)}
      {(['player', 'goalie', 'goal'] as const).map(target => <button key={target} onClick={() => {
        const gust = windSchedule.find(g => g.target === target &&
          (target !== 'player' || getBonusChallengeCondition(localRules, g.startMs).canShoot));
        if (!gust) return;
        setStart(gust.startMs); setShots(0); setGoals(0); setDone(false); setEpoch(n => n + 1);
      }}>Порыв: {target === 'player' ? 'игрок' : target === 'goalie' ? 'вратарь' : 'ворота'}</button>)}
      <button onClick={() => setDelay(value => !value)}>Ответ: {delay ? '2,5 с' : 'сразу'}</button>
    </div>
  </>;
}
document.documentElement.style.setProperty('--app-play-safe-bottom', '82px');
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
import.meta.hot?.dispose(() => root.unmount());
