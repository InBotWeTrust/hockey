import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Container, type Application } from 'pixi.js';
import {
  GOAL,
  GOAL_OPENING,
  GOALIE_SIZE,
  GOALIE_Y,
  PUCK_START,
  RINK,
  STICK_NEUTRAL,
  getPerspectiveCourtGoalieHitbox,
  getPerspectiveCourtGoalOpening,
  PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
  PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_X_CENTER,
  PERSPECTIVE_COURT_VISUAL_Y_OFFSET,
  PERSPECTIVE_COURT_VISUAL_Y_SCALE,
  getDailyPeriodSpeedPreset,
  getSessionPhaseOffsets,
  simulateGoal,
  simulateGoalie,
  simulateShooter,
  type GoalieConfig,
  type GoalieState,
  type ManualProjection,
} from '@hockey/game-core';
import { type Scale } from './coords.js';
import { PixiStage } from './PixiStage.js';
import { Goal } from './renderer/Goal.js';
import { Goalie } from './renderer/Goalie.js';
import { Player } from './renderer/Player.js';
import { Puck } from './renderer/Puck.js';
import {
  PERSPECTIVE_GOAL_OPTIONS,
  PERSPECTIVE_PLAYER_OPTIONS,
  PERSPECTIVE_PUCK_OPTIONS,
  TRAINING_AMATEUR_GOALIE_OPTIONS,
} from './PlayView.js';

export interface ConstructorScene {
  playerX: number;
  goalOffsetX: number;
  goalieState: GoalieState;
}

export function getConstructorScene(seed: string, timeMs: number, goalie: GoalieConfig,
  shotIndex: number): ConstructorScene {
  const speeds = getDailyPeriodSpeedPreset(1);
  const offsets = getSessionPhaseOffsets(seed);
  return {
    playerX: simulateShooter(timeMs + offsets.shooter, speeds.shooterFrequency).x,
    goalOffsetX: simulateGoal({ ...goalie, goalFrequency: speeds.goalFrequency },
      timeMs, offsets.goal).offsetX,
    goalieState: simulateGoalie({ ...goalie, frequency: speeds.goalieFrequency },
      seed, shotIndex, timeMs, offsets.goalie),
  };
}

type DraggableEntity = 'player' | 'goal' | 'goalie';

export interface MarksmanshipConstructorCourtProps {
  seed: string;
  timeMs: number;
  goalie: GoalieConfig;
  shotIndex: number;
  showHitboxes: boolean;
  manual?: ManualProjection | null;
  onDragCenter?: (entity: DraggableEntity, x: number) => void;
}

interface Renderers {
  goal: Goal;
  goalie: Goalie;
  player: Player;
  puck: Puck;
  scale: Scale;
}

export function MarksmanshipConstructorCourt(props: MarksmanshipConstructorCourtProps): JSX.Element {
  const renderersRef = useRef<Renderers | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const draggingRef = useRef<DraggableEntity | null>(null);
  const scene = getConstructorScene(props.seed, props.timeMs, props.goalie, props.shotIndex);
  const playerX = props.manual?.playerX ?? scene.playerX;
  const goalOffsetX = props.manual === undefined || props.manual === null
    ? scene.goalOffsetX
    : (props.manual.goalCenterX - PERSPECTIVE_COURT_VISUAL_X_CENTER) /
      PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
  const goalieState = props.manual === undefined || props.manual === null
    ? scene.goalieState
    : {
      position: {
        x: PERSPECTIVE_COURT_VISUAL_X_CENTER +
          (props.manual.goalieCenterX - PERSPECTIVE_COURT_VISUAL_X_CENTER) /
            PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE,
        y: GOALIE_Y,
      },
      width: GOALIE_SIZE.width,
      height: GOALIE_SIZE.height,
    };

  const draw = useCallback(() => {
    const renderers = renderersRef.current;
    if (renderers === null) return;
    const current = propsRef.current;
    const sample = getConstructorScene(current.seed, current.timeMs, current.goalie, current.shotIndex);
    const x = current.manual?.playerX ?? sample.playerX;
    const offset = current.manual === undefined || current.manual === null
      ? sample.goalOffsetX
      : (current.manual.goalCenterX - PERSPECTIVE_COURT_VISUAL_X_CENTER) /
        PERSPECTIVE_COURT_GOAL_VISUAL_OFFSET_X_SCALE;
    const goaliePosition = current.manual === undefined || current.manual === null
      ? sample.goalieState
      : { position: { x: PERSPECTIVE_COURT_VISUAL_X_CENTER +
          (current.manual.goalieCenterX - PERSPECTIVE_COURT_VISUAL_X_CENTER) /
            PERSPECTIVE_COURT_GOALIE_VISUAL_X_SCALE, y: GOALIE_Y },
        width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };
    renderers.goal.update(renderers.scale, offset);
    renderers.goalie.update(goaliePosition, renderers.scale);
    renderers.player.update(renderers.scale, x, PUCK_START.y);
    renderers.puck.resetAtStart(renderers.scale, x);
  }, []);

  const handleReady = useCallback((app: Application, scale: Scale) => {
    const goal = new Goal(PERSPECTIVE_GOAL_OPTIONS);
    const goalie = new Goalie(TRAINING_AMATEUR_GOALIE_OPTIONS);
    const player = new Player('right', PERSPECTIVE_PLAYER_OPTIONS);
    const puck = new Puck('right', PERSPECTIVE_PUCK_OPTIONS);
    const layer = new Container();
    layer.addChild(goal.container, goalie.container, player.container, puck.container);
    app.stage.addChild(layer);
    renderersRef.current = { goal, goalie, player, puck, scale };
    draw();
  }, [draw]);

  const handleResize = useCallback((scale: Scale) => {
    if (renderersRef.current === null) return;
    renderersRef.current.scale = scale;
    draw();
  }, [draw]);

  // PixiStage owns the stage; these renderers own async sprite texture loads.
  // Its callbacks can arrive after a prop update, so draw reads propsRef.
  useEffect(() => { draw(); }, [draw, props.seed, props.timeMs, props.goalie,
    props.shotIndex, props.manual]);
  useEffect(() => () => {
    const renderers = renderersRef.current;
    renderersRef.current = null;
    renderers?.goal.destroy();
    renderers?.goalie.destroy();
    renderers?.player.destroy();
    renderers?.puck.destroy();
  }, []);

  const offsets = getSessionPhaseOffsets(props.seed);
  const speeds = getDailyPeriodSpeedPreset(1);
  const shotInput = {
    tapTime: props.timeMs,
    puckSpeedPerMs: speeds.puckSpeedPerMs,
    shooterFrequency: speeds.shooterFrequency,
    goalieFrequency: speeds.goalieFrequency,
    goalFrequency: speeds.goalFrequency,
  };
  const goalAtNow = getPerspectiveCourtGoalOpening({
    ...shotInput,
    tapTime: props.timeMs - (PUCK_START.y - GOAL_OPENING.y) / speeds.puckSpeedPerMs,
  }, props.goalie, offsets);
  const goalieAtNow = getPerspectiveCourtGoalieHitbox({
    ...shotInput,
    tapTime: props.timeMs - (PUCK_START.y - GOALIE_Y) / speeds.puckSpeedPerMs,
  }, props.goalie, props.seed, props.shotIndex, STICK_NEUTRAL, offsets);
  const goalBounds = props.manual?.goalHitbox ?? { minX: goalAtNow.xMin, maxX: goalAtNow.xMax };
  const goalieBounds = props.manual?.goalieHitbox ?? { minX: goalieAtNow.xMin, maxX: goalieAtNow.xMax };
  const goalY = ((GOAL.y + GOAL_OPENING.y) / 2) * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
    PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET;
  const goalieY = GOALIE_Y * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
    PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET;
  const playerY = PUCK_START.y * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
    PERSPECTIVE_COURT_VISUAL_Y_OFFSET;

  const drag = (event: ReactPointerEvent<SVGRectElement>, entity: DraggableEntity) => {
    if (draggingRef.current !== entity || props.onDragCenter === undefined) return;
    const svg = event.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    const width = rect?.width || RINK.width;
    const x = ((event.clientX - (rect?.left ?? 0)) / width) * RINK.width;
    props.onDragCenter(entity, x);
  };

  return (
    <div className="marksmanship-constructor-court" style={{ position: 'relative',
      width: '100%', aspectRatio: '1212 / 2000', overflow: 'hidden' }}>
      <img src="/sprites/amateur-daily-court.webp" alt="Любительская площадка"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0 }}>
        <PixiStage onReady={handleReady} onResize={handleResize}
          preloadAssets={['/sprites/test-goal-clean.webp',
            '/sprites/training-goalie-amateur.webp', '/sprites/training-goalie-amateur-save.webp']} />
      </div>
      <svg viewBox="0 0 572 700" aria-label="Координатная сетка"
        style={{ position: 'absolute', width: '100%', aspectRatio: '572 / 700',
          maxHeight: '100%', top: '50%', transform: 'translateY(-50%)',
          pointerEvents: props.onDragCenter ? 'auto' : 'none' }}>
        {Array.from({ length: 12 }, (_, index) => index * 50).map((x) => (
          <g key={x}>
            <line x1={x} x2={x} y1={0} y2={700} stroke="#1e6090" strokeOpacity="0.25" />
            <text x={x + 2} y={692} fontSize={13} fill="#173b59">{x}</text>
          </g>
        ))}
        {props.showHitboxes && (
          <g aria-label="Хитбоксы фигур">
            <rect x={goalBounds.minX} y={goalY - 14} width={goalBounds.maxX - goalBounds.minX}
              height={28} fill="none" stroke="#169a5c" strokeWidth={2} />
            <rect x={goalieBounds.minX} y={goalieY - 28}
              width={goalieBounds.maxX - goalieBounds.minX} height={56}
              fill="none" stroke="#d8424d" strokeWidth={2} />
            <rect x={playerX - 50.5} y={playerY - 45} width={101} height={90}
              fill="none" stroke="#2563eb" strokeWidth={2} />
            <line x1={playerX} x2={playerX} y1={goalY} y2={playerY}
              stroke="#245f9b" strokeDasharray="6 5" />
          </g>
        )}
        {props.onDragCenter && ([
          ['goal', (goalBounds.minX + goalBounds.maxX) / 2, goalY],
          ['goalie', (goalieBounds.minX + goalieBounds.maxX) / 2, goalieY],
          ['player', playerX, playerY],
        ] as const).map(([entity, x, y]) => (
          <rect key={entity} role="button" tabIndex={0}
            aria-label={`Двигать ${entity === 'goal' ? 'ворота' : entity === 'goalie' ? 'вратаря' : 'игрока'}`}
            x={x - 35} y={y - 35} width={70} height={70} fill="transparent"
            onPointerDown={(event) => { draggingRef.current = entity; }}
            onPointerMove={(event) => drag(event, entity)}
            onPointerUp={() => { draggingRef.current = null; }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              props.onDragCenter?.(entity, x + (event.key === 'ArrowRight' ? 1 : -1));
            }} />
        ))}
      </svg>
    </div>
  );
}
