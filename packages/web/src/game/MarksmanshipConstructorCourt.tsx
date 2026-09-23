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
  LONG_COURT_GAME_LAYER_STYLE,
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
  futureGoal: Goal;
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
    const currentSpeeds = getDailyPeriodSpeedPreset(1);
    const currentOffsets = getSessionPhaseOffsets(current.seed);
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / currentSpeeds.puckSpeedPerMs;
    const futureOffset = simulateGoal({ ...current.goalie,
      goalFrequency: currentSpeeds.goalFrequency }, current.timeMs + flightMs,
      currentOffsets.goal).offsetX;
    renderers.goal.update(renderers.scale, offset);
    renderers.futureGoal.container.visible = current.manual === undefined || current.manual === null;
    renderers.futureGoal.update(renderers.scale, futureOffset);
    renderers.goalie.update(goaliePosition, renderers.scale);
    renderers.player.update(renderers.scale, x, PUCK_START.y);
    renderers.puck.resetAtStart(renderers.scale, x);
  }, []);

  const handleReady = useCallback((app: Application, scale: Scale) => {
    const goal = new Goal(PERSPECTIVE_GOAL_OPTIONS);
    const futureGoal = new Goal(PERSPECTIVE_GOAL_OPTIONS);
    futureGoal.container.alpha = 0.38;
    const goalie = new Goalie(TRAINING_AMATEUR_GOALIE_OPTIONS);
    const player = new Player('right', PERSPECTIVE_PLAYER_OPTIONS);
    const puck = new Puck('right', PERSPECTIVE_PUCK_OPTIONS);
    const layer = new Container();
    layer.addChild(futureGoal.container, goal.container, goalie.container,
      player.container, puck.container);
    app.stage.addChild(layer);
    renderersRef.current = { goal, futureGoal, goalie, player, puck, scale };
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
    renderers?.futureGoal.destroy();
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
  const futureGoalBounds = getPerspectiveCourtGoalOpening(shotInput, props.goalie, offsets);
  const futureGoalCenter = (futureGoalBounds.xMin + futureGoalBounds.xMax) / 2;
  const goalieBounds = props.manual?.goalieHitbox ?? { minX: goalieAtNow.xMin, maxX: goalieAtNow.xMax };
  const goalY = ((GOAL.y + GOAL_OPENING.y) / 2) * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
    PERSPECTIVE_COURT_GOAL_VISUAL_Y_OFFSET;
  const goalieY = GOALIE_Y * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
    PERSPECTIVE_COURT_GOALIE_VISUAL_Y_OFFSET;
  const playerY = PUCK_START.y * PERSPECTIVE_COURT_VISUAL_Y_SCALE +
    PERSPECTIVE_COURT_VISUAL_Y_OFFSET;
  const nextScene = getConstructorScene(props.seed, props.timeMs + 25, props.goalie, props.shotIndex);
  const directions = props.manual ? null : [
    { name: 'Игрок', x: playerX, y: playerY - 58,
      right: nextScene.playerX >= scene.playerX },
    { name: 'Ворота', x: (goalBounds.minX + goalBounds.maxX) / 2, y: goalY - 52,
      right: nextScene.goalOffsetX >= scene.goalOffsetX },
    { name: 'Вратарь', x: (goalieBounds.minX + goalieBounds.maxX) / 2, y: goalieY + 10,
      right: nextScene.goalieState.position.x >= scene.goalieState.position.x },
  ];

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
      <div style={{ position: 'absolute', left: 0, right: 0,
        ...LONG_COURT_GAME_LAYER_STYLE }}>
        <PixiStage onReady={handleReady} onResize={handleResize}
          preloadAssets={['/sprites/test-goal-clean.webp',
            '/sprites/training-goalie-amateur.webp', '/sprites/training-goalie-amateur-save.webp']} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0,
        ...LONG_COURT_GAME_LAYER_STYLE }}>
      <svg viewBox="0 0 572 700" aria-label="Координатная сетка"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: props.onDragCenter ? 'auto' : 'none' }}>
        {Array.from({ length: 12 }, (_, index) => index * 50).map((x) => (
          <g key={x}>
            <line x1={x} x2={x} y1={0} y2={700} stroke="#1e6090" strokeOpacity="0.25" />
            <text x={x + 2} y={692} fontSize={13} fill="#173b59">{x}</text>
          </g>
        ))}
        <line aria-label="Линия броска игрока" x1={playerX} x2={playerX} y1={0} y2={playerY}
          stroke="#245f9b" strokeWidth={1.5} strokeDasharray="6 5" />
        {!props.manual && (
          <g aria-label="Ворота при прилёте шайбы" data-center-x={futureGoalCenter}
            pointerEvents="none">
            <rect x={futureGoalBounds.xMin} y={goalY - 16}
              width={futureGoalBounds.xMax - futureGoalBounds.xMin} height={32}
              fill="none" stroke="#ffe487" strokeWidth={2} strokeDasharray="6 4" />
            <text x={futureGoalCenter} y={goalY - 38} textAnchor="middle" fontSize={16}
              fontWeight={700} fill="#fff" stroke="#173b59" strokeWidth={3}
              paintOrder="stroke">ПРИ ПРИЛЁТЕ</text>
          </g>
        )}
        {props.showHitboxes && (
          <g aria-label="Хитбоксы фигур">
            <rect x={goalBounds.minX} y={goalY - 14} width={goalBounds.maxX - goalBounds.minX}
              height={28} fill="none" stroke="#169a5c" strokeWidth={2} />
            <rect x={goalieBounds.minX} y={goalieY - 28}
              width={goalieBounds.maxX - goalieBounds.minX} height={56}
              fill="none" stroke="#d8424d" strokeWidth={2} />
            <rect x={playerX - 50.5} y={playerY - 45} width={101} height={90}
              fill="none" stroke="#2563eb" strokeWidth={2} />
          </g>
        )}
        {directions?.map(({ name, x, y, right }) => (
          <g key={name} aria-label={`${name} ${name === 'Ворота' ? 'движутся' : 'движется'} ${right ? 'вправо' : 'влево'}`}
            transform={`translate(${x} ${y})`} pointerEvents="none">
            <circle r={15} fill="#102b45" fillOpacity={0.85} stroke="#dceaf5" strokeWidth={1.5} />
            <text x={0} y={7} textAnchor="middle" fontSize={23} fontWeight={700}
              fill="#fff">{right ? '→' : '←'}</text>
          </g>
        ))}
        {props.onDragCenter && ([
          ['goal', (goalBounds.minX + goalBounds.maxX) / 2, goalY],
          ['goalie', (goalieBounds.minX + goalieBounds.maxX) / 2, goalieY],
          ['player', playerX, playerY],
        ] as const).map(([entity, x, y]) => (
          <rect key={entity} role="button" tabIndex={0}
            aria-label={`Двигать ${entity === 'goal' ? 'ворота' : entity === 'goalie' ? 'вратаря' : 'игрока'}`}
            x={x - 35} y={y - 35} width={70} height={70} fill="transparent"
            onPointerDown={() => { draggingRef.current = entity; }}
            onPointerMove={(event) => drag(event, entity)}
            onPointerUp={() => { draggingRef.current = null; }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              props.onDragCenter?.(entity, x + (event.key === 'ArrowRight' ? 1 : -1));
            }} />
        ))}
      </svg>
      </div>
    </div>
  );
}
