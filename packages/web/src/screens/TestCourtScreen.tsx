import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DAILY_PERIOD_SPEED_PRESETS,
  type ShotResult,
} from '@hockey/game-core';
import { PlayView, type PlayShotResolver } from './DailyScreen.js';
import {
  TRAINING_NEW_COURT_BACKGROUND,
  TRAINING_NEW_COURT_BG_CROP_BOTTOM,
  TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
  TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
  TRAINING_NEW_COURT_HITBOX_GOALIE_INSET,
  TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE,
  TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE,
  TRAINING_NEW_COURT_HITBOX_GOAL_INSET,
  TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  resolveNewTrainingCourtShot,
} from '../game/trainingNewCourt.js';
import type { ShotInputPayload, ShotResultType } from '../api/duel.js';

const TEST_COURT_SEED = 'test-court:new-angle:2026-05-06';
const TEST_COURT_GOALIE_ID = 'rookie';

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
}): ShotResult =>
  resolveNewTrainingCourtShot({
    input,
    goalieConfig,
    seed,
    shotIndex,
    stickEffects,
    phaseOffsets,
    shooterX,
  });

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
          visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
          visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
          shadow: true,
        }}
        goalOptions={{
          spriteUrl: '/sprites/test-goal-clean.webp',
          gateWidth: 102,
          gateAspect: 1097 / 734,
          visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
          visualYOffset: TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
          visualOffsetXScale: TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
          spriteAnchorY: 1,
        }}
        goalieOptions={{
          idleSpriteUrl: '/sprites/test-goalie-black.webp',
          saveSpriteUrl: '/sprites/test-goalie-black-save.webp',
          visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
          visualYOffset: TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
          visualXScale: TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
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
          visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
          visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
          bladeOffsetX: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
          bladeOffsetY: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
          flightVisualYOffset: TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
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
          goalWidthScale: TRAINING_NEW_COURT_HITBOX_GOAL_WIDTH_SCALE,
          goalHeightScale: TRAINING_NEW_COURT_HITBOX_GOAL_HEIGHT_SCALE,
          goalInset: TRAINING_NEW_COURT_HITBOX_GOAL_INSET,
          goalieWidthScale: TRAINING_NEW_COURT_HITBOX_GOALIE_WIDTH_SCALE,
          goalieHeightScale: TRAINING_NEW_COURT_HITBOX_GOALIE_HEIGHT_SCALE,
          goalieInset: TRAINING_NEW_COURT_HITBOX_GOALIE_INSET,
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
        src={TRAINING_NEW_COURT_BACKGROUND}
        alt=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: `calc(100% + ${TRAINING_NEW_COURT_BG_CROP_BOTTOM})`,
          objectFit: 'cover',
        }}
      />
    </div>
  );
}
