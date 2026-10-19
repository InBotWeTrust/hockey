import {projectRhythm,type RhythmShot} from '@hockey/game-core';
import {FittedNotice} from '../../game/FittedNotice.js';
import {rhythmGoalDetails} from './scoredDuel.js';

export function RhythmShotNotice({shots,version,travel,boardContacts}:{shots:readonly RhythmShot[];version:1|2|3|4;travel?:number|undefined;boardContacts?:number|undefined}): JSX.Element | null {
  const text=rhythmGoalDetails(shots,version,travel,boardContacts)[0];
  if (!text) return null;
  const series=projectRhythm({shots,travel:travel??shots.at(-1)?.travel??0,version,currentBoardContacts:boardContacts??shots.at(-1)?.boardContacts??0}).currentSeries;
  return <FittedNotice fit role="status" aria-live="polite"
    className={`duel-stumble-notice initial-training-feedback-notice--scoreboard${version===4 ? ' initial-training-feedback-notice' : ''}${version===4 && series<4 ? ' initial-training-feedback-notice--warning' : ''}`}>{text}</FittedNotice>;
}
