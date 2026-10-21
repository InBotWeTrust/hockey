import type { BonusSkillCode } from '../api/bonusGames.js';
import { BonusGamesScreen } from '../screens/BonusGamesScreen.js';
export function BonusSkillPage({ skill }: { skill: BonusSkillCode; active: boolean }) {
  return <BonusGamesScreen embeddedSkill={skill} />;
}
