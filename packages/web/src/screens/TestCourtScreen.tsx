import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DAILY_PERIOD_SPEED_PRESETS } from '@hockey/game-core';
import { PlayView } from './DailyScreen.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

const TEST_COURT_SEED = 'test-court:new-angle:2026-05-06';
const TEST_COURT_GOALIE_ID = 'rookie';
const TEST_COURT_BACKGROUND = '/sprites/test-court-bg.webp';
const TEST_COURT_BG_CROP_BOTTOM = '7%';
const TEST_COURT_VISUAL_Y_SCALE = 0.72;
const TEST_COURT_VISUAL_Y_OFFSET = 205;
const TEST_COURT_GOAL_VISUAL_Y_OFFSET = 88;
const TEST_COURT_GOALIE_VISUAL_Y_OFFSET = 72;
const TEST_COURT_GOAL_VISUAL_OFFSET_X_SCALE = 0.9;
const TEST_COURT_GOALIE_VISUAL_X_SCALE = 0.9;
const TEST_COURT_PUCK_BLADE_OFFSET_X = 28;
const TEST_COURT_PUCK_BLADE_OFFSET_Y = 17;
const TEST_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET = -127;

interface TestCourtState {
  shots: number;
  goals: number;
}

function advanceTestCourtState(state: TestCourtState, result: ShotResultType): TestCourtState {
  return {
    shots: state.shots + 1,
    goals: state.goals + (result === 'goal' ? 1 : 0),
  };
}

export function TestCourtScreen(): JSX.Element {
  const navigate = useNavigate();
  const [state, setState] = useState<TestCourtState>({ shots: 0, goals: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyState = useCallback((next: TestCourtState): void => {
    stateRef.current = next;
    setState(next);
  }, []);

  const optimisticAddShot = useCallback(
    (claimed: ShotResultType): void => {
      applyState(advanceTestCourtState(stateRef.current, claimed));
    },
    [applyState],
  );

  const submitShot = useCallback(
    async ({
      claimedResult,
    }: {
      shotIndex: number;
      input: ShotInputPayload;
      claimedResult: ShotResultType;
    }): Promise<{ serverResult: ShotResultType; state: TestCourtState }> => ({
      serverResult: claimedResult,
      state: stateRef.current,
    }),
    [],
  );

  return (
    <>
      <h1
        style={{
          position: 'fixed',
          top: 'calc(var(--app-safe-top) + 3px)',
          left: 14,
          zIndex: 530,
          margin: 0,
          color: 'rgba(15, 23, 42, 0.72)',
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Тестовая площадка
      </h1>

      <PlayView<TestCourtState>
        suppressedByModal={false}
        showIceCar={false}
        onBack={() => navigate('/?view=hub')}
        active
        seed={TEST_COURT_SEED}
        goalieId={TEST_COURT_GOALIE_ID}
        periodNumber={1}
        periodSpeedPresets={DAILY_PERIOD_SPEED_PRESETS}
        goals={state.goals}
        shots={state.shots}
        timer="∞"
        timerLabel="ТЕСТ"
        backLabel="К игре"
        playerGrip="right"
        playerOptions={{
          spriteUrl: '/sprites/test-hockey-player.webp',
          spriteWidth: 100,
          spriteAspect: 941 / 1062,
          baseRotation: 0,
          shotMaxRotation: 0.24,
          visualYScale: TEST_COURT_VISUAL_Y_SCALE,
          visualYOffset: TEST_COURT_VISUAL_Y_OFFSET,
        }}
        goalOptions={{
          spriteUrl: '/sprites/test-goal-clean.webp',
          gateWidth: 102,
          gateAspect: 1097 / 734,
          visualYScale: TEST_COURT_VISUAL_Y_SCALE,
          visualYOffset: TEST_COURT_GOAL_VISUAL_Y_OFFSET,
          visualOffsetXScale: TEST_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
          spriteAnchorY: 1,
        }}
        goalieOptions={{
          visualYScale: TEST_COURT_VISUAL_Y_SCALE,
          visualYOffset: TEST_COURT_GOALIE_VISUAL_Y_OFFSET,
          visualXScale: TEST_COURT_GOALIE_VISUAL_X_SCALE,
          sizeScale: 1.14,
        }}
        puckOptions={{
          radiusScaleX: 1.16,
          radiusScaleY: 0.82,
          rotation: 0,
          visualYScale: TEST_COURT_VISUAL_Y_SCALE,
          visualYOffset: TEST_COURT_VISUAL_Y_OFFSET,
          bladeOffsetX: TEST_COURT_PUCK_BLADE_OFFSET_X,
          bladeOffsetY: TEST_COURT_PUCK_BLADE_OFFSET_Y,
          flightVisualYOffset: TEST_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
        }}
        optimisticAddShot={optimisticAddShot}
        submitShot={submitShot}
        applyState={applyState}
        rinkAspectRatio="1024 / 1428"
        rinkBorderRadius={36}
        rinkLayer={<TestPerspectiveRink />}
      />
    </>
  );
}

function TestPerspectiveRink(): JSX.Element {
  return (
    <div
      role="img"
      aria-label="Тестовая площадка в перспективе"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        background: '#dceaf5',
      }}
    >
      <img
        src={TEST_COURT_BACKGROUND}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: `calc(100% + ${TEST_COURT_BG_CROP_BOTTOM})`,
          objectFit: 'cover',
        }}
      />
    </div>
  );
}
