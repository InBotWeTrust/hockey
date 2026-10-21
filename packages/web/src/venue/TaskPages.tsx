import { AchievementsScreen } from '../screens/AchievementsScreen.js';
import { WeeklyChallengeScreen } from '../screens/WeeklyChallengeScreen.js';
export function TaskPage({
  id,
  profileContext = false,
}: {
  id: 'tasks' | 'challenges';
  profileContext?: boolean;
}) {
  return id === 'tasks' ? (
    <AchievementsScreen profileContext={profileContext} />
  ) : (
    <WeeklyChallengeScreen profileContext={profileContext} heading="Челленджи" />
  );
}
