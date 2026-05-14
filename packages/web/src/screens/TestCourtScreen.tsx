import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DAILY_PERIOD_SPEED_PRESETS,
  GOALIE_HITBOX_EXPAND,
  GOALIE_Y,
  GOAL_HITBOX_MARGIN,
  GOAL_OPENING,
  PUCK_SPEED_PER_MS,
  PUCK_START,
  simulateGoal,
  simulateGoalie,
  type ShotResult,
} from '@hockey/game-core';
import { PlayView, type PlayShotResolver } from './DailyScreen.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

const TEST_COURT_SEED = 'test-court:new-angle:2026-05-06';
const TEST_COURT_GOALIE_ID = 'rookie';
const TEST_COURT_BACKGROUND = '/sprites/test-court-bg.webp';
const TEST_COURT_BG_CROP_BOTTOM = '7%';
const TEST_COURT_VISUAL_Y_SCALE = 0.72;
const TEST_COURT_VISUAL_Y_OFFSET = 205;
const TEST_COURT_GOAL_VISUAL_Y_OFFSET = 88;
const TEST_COURT_GOALIE_VISUAL_Y_OFFSET = 62;
const TEST_COURT_GOAL_VISUAL_OFFSET_X_SCALE = 0.9;
const TEST_COURT_GOALIE_VISUAL_X_SCALE = 0.9;
const TEST_COURT_PUCK_BLADE_OFFSET_X = 38;
const TEST_COURT_PUCK_BLADE_OFFSET_Y = 27;
const TEST_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET = -127;
const TEST_COURT_HITBOX_GOAL_WIDTH_SCALE = 1.28;
const TEST_COURT_HITBOX_GOAL_HEIGHT_SCALE = 1.35;
const TEST_COURT_HITBOX_GOAL_INSET = 3;
const TEST_COURT_HITBOX_GOALIE_WIDTH_SCALE = 1.35;
const TEST_COURT_HITBOX_GOALIE_HEIGHT_SCALE = 1.28;
const TEST_COURT_HITBOX_GOALIE_INSET = 2;

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

export const resolveTestCourtShot: PlayShotResolver = ({
  input,
  goalieConfig,
  seed,
  shotIndex,
  stickEffects,
  phaseOffsets,
  shooterX,
}): ShotResult => {
  const speed = input.puckSpeedPerMs ?? PUCK_SPEED_PER_MS;
  const effectiveCfg = {
    ...goalieConfig,
    frequency: input.goalieFrequency ?? goalieConfig.frequency,
    goalFrequency: input.goalFrequency ?? goalieConfig.goalFrequency,
  };
  const tGoalieCross = input.tapTime + (PUCK_START.y - GOALIE_Y) / speed;
  const goalieState = simulateGoalie(
    effectiveCfg,
    seed,
    shotIndex,
    tGoalieCross,
    phaseOffsets.goalie,
  );
  const shrink = 1 / Math.max(stickEffects.shotZoneMultiplier, 1);
  const visualGoalieX = 286 + (goalieState.position.x - 286) * TEST_COURT_GOALIE_VISUAL_X_SCALE;
  const goalieWidth = Math.max(
    0,
    (goalieState.width * shrink + GOALIE_HITBOX_EXPAND) * TEST_COURT_HITBOX_GOALIE_WIDTH_SCALE -
      TEST_COURT_HITBOX_GOALIE_INSET * 2,
  );
  if (shooterX >= visualGoalieX - goalieWidth / 2 && shooterX <= visualGoalieX + goalieWidth / 2) {
    return { type: 'save', goalieContact: { x: shooterX, y: GOALIE_Y } };
  }

  const tGoalCross = input.tapTime + (PUCK_START.y - GOAL_OPENING.y) / speed;
  const goalOffsetAtCross =
    simulateGoal(effectiveCfg, tGoalCross, phaseOffsets.goal).offsetX *
    TEST_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const openingCenterX = (GOAL_OPENING.xMin + GOAL_OPENING.xMax) / 2 + goalOffsetAtCross;
  const openingWidth = Math.max(
    0,
    (GOAL_OPENING.xMax - GOAL_HITBOX_MARGIN - (GOAL_OPENING.xMin + GOAL_HITBOX_MARGIN)) *
      TEST_COURT_HITBOX_GOAL_WIDTH_SCALE -
      TEST_COURT_HITBOX_GOAL_INSET * 2,
  );

  if (
    shooterX < openingCenterX - openingWidth / 2 ||
    shooterX > openingCenterX + openingWidth / 2
  ) {
    return { type: 'miss', reason: 'wide' };
  }

  return { type: 'goal', hitPoint: { x: shooterX, y: GOAL_OPENING.y } };
};

export function TestCourtScreen(): JSX.Element {
  const navigate = useNavigate();
  const [state, setState] = useState<TestCourtState>({ shots: 0, goals: 0 });
  const [hitboxesVisible, setHitboxesVisible] = useState(false);
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
      <label
        style={{
          position: 'fixed',
          top: 'calc(var(--app-safe-top) + 82px)',
          left: 14,
          zIndex: 540,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          minHeight: 32,
          padding: '7px 10px',
          borderRadius: 999,
          background: 'rgba(8, 24, 43, 0.72)',
          border: '1px solid rgba(255, 255, 255, 0.24)',
          color: 'rgba(255, 255, 255, 0.9)',
          fontSize: 11,
          fontWeight: 900,
          lineHeight: 1,
          boxShadow: '0 12px 28px rgba(7, 19, 33, 0.2)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <input
          type="checkbox"
          checked={hitboxesVisible}
          onChange={(event) => setHitboxesVisible(event.currentTarget.checked)}
          style={{
            width: 14,
            height: 14,
            margin: 0,
            accentColor: '#22cc66',
          }}
        />
        Хитбоксы
      </label>

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
          spriteWidth: 112,
          spriteAspect: 941 / 1062,
          baseRotation: 0,
          shotMaxRotation: 0.24,
          visualYScale: TEST_COURT_VISUAL_Y_SCALE,
          visualYOffset: TEST_COURT_VISUAL_Y_OFFSET,
          shadow: true,
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
          idleSpriteUrl: '/sprites/test-goalie-black.webp',
          saveSpriteUrl: '/sprites/test-goalie-black-save.webp',
          visualYScale: TEST_COURT_VISUAL_Y_SCALE,
          visualYOffset: TEST_COURT_GOALIE_VISUAL_Y_OFFSET,
          visualXScale: TEST_COURT_GOALIE_VISUAL_X_SCALE,
          sizeScale: 1.26,
          idleSizeScale: 1.22,
          saveSizeScale: 0.96,
          saveVisualYOffset: 10,
          shadow: true,
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
        shotResolver={resolveTestCourtShot}
        rinkAspectRatio="1024 / 1428"
        rinkBorderRadius={36}
        rinkLayer={<TestPerspectiveRink />}
        hitboxesVisible={hitboxesVisible}
        hitboxesOptions={{
          goalWidthScale: TEST_COURT_HITBOX_GOAL_WIDTH_SCALE,
          goalHeightScale: TEST_COURT_HITBOX_GOAL_HEIGHT_SCALE,
          goalInset: TEST_COURT_HITBOX_GOAL_INSET,
          goalieWidthScale: TEST_COURT_HITBOX_GOALIE_WIDTH_SCALE,
          goalieHeightScale: TEST_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
          goalieInset: TEST_COURT_HITBOX_GOALIE_INSET,
        }}
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
