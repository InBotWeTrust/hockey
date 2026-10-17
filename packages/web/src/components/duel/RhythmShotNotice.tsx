import type {RhythmShot} from '@hockey/game-core';
import {FittedNotice} from '../../game/FittedNotice.js';
import {rhythmGoalDetails} from './scoredDuel.js';

export function RhythmShotNotice({shots,version}:{shots:readonly RhythmShot[];version:1|2}): JSX.Element | null {
  const text=rhythmGoalDetails(shots,version)[0];
  if (!text) return null;
  return <FittedNotice fit role="status" aria-live="polite"
    className="duel-stumble-notice initial-training-feedback-notice--scoreboard">{text}</FittedNotice>;
}
