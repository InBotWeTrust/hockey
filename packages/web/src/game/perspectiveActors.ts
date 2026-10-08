import type { PlayerOptions } from './renderer/Player.js';
import type { GoalOptions } from './renderer/Goal.js';
import type { GoalieOptions } from './renderer/Goalie.js';
import type { PuckOptions } from './renderer/Puck.js';
import {
  TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
  TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  TRAINING_NEW_COURT_VISUAL_Y_SCALE,
} from './trainingNewCourt.js';

export const PERSPECTIVE_PLAYER_OPTIONS: PlayerOptions = {
  spriteUrls: {
    left: '/sprites/ultimate-player-left.webp',
    right: '/sprites/ultimate-player-right.webp',
  },
  shotSpriteUrls: {
    left: '/sprites/ultimate-player-left-shoot.webp',
    right: '/sprites/ultimate-player-right-shoot.webp',
  },
  stumbleSpriteUrl: '/sprites/player-falling.webp',
  restSpriteUrl: '/sprites/player-rest.webp',
  spriteWidth: 101,
  spriteAspect: 942 / 1067,
  stumbleSpriteWidth: 110,
  stumbleSpriteAspect: 1130 / 1150,
  stumbleRotation: 0,
  restSpriteWidth: 84,
  restSpriteAspect: 1000 / 1374,
  restRotation: 0,
  baseRotation: 0,
  shotMaxRotation: 0,
  shotDurationMs: 500,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
};

export const PERSPECTIVE_GOAL_OPTIONS: GoalOptions = {
  spriteUrl: '/sprites/test-goal-clean.webp',
  gateWidth: 92,
  gateAspect: 1097 / 734,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_GOAL_VISUAL_Y_OFFSET,
  visualOffsetXScale: TRAINING_NEW_COURT_GOAL_VISUAL_OFFSET_X_SCALE,
  spriteAnchorY: 1,
};

export const PERSPECTIVE_GOALIE_OPTIONS: GoalieOptions = {
  idleSpriteUrl: '/sprites/test-goalie-black.webp',
  saveSpriteUrl: '/sprites/test-goalie-black-save.webp',
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_GOALIE_VISUAL_Y_OFFSET,
  visualXScale: TRAINING_NEW_COURT_GOALIE_VISUAL_X_SCALE,
  sizeScale: 1.134,
  idleSizeScale: 1.22,
  saveSizeScale: 0.96,
  saveVisualYOffset: 10,
};

export const PERSPECTIVE_PUCK_OPTIONS: PuckOptions = {
  radiusScaleX: 1.16,
  radiusScaleY: 0.82,
  rotation: 0,
  visualYScale: TRAINING_NEW_COURT_VISUAL_Y_SCALE,
  visualYOffset: TRAINING_NEW_COURT_VISUAL_Y_OFFSET,
  bladeOffsetX: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_X,
  bladeOffsetY: TRAINING_NEW_COURT_PUCK_BLADE_OFFSET_Y,
  flightVisualYOffset: TRAINING_NEW_COURT_PUCK_FLIGHT_VISUAL_Y_OFFSET,
};
