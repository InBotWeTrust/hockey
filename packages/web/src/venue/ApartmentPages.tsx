import {ReferralsScreen} from '../screens/ReferralsScreen.js';
import { useLocation } from 'react-router-dom';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { ProfileRewardsScreen } from '../screens/ProfileRewardsScreen.js';
import { ProfileFriendsScreen } from '../screens/ProfileFriendsScreen.js';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen.js';
import {
  ProfileStoryScreen,
  ProfileStatsScreen,
  ProfileArenaScreen,
} from '../screens/ProfileDestinationScreens.js';
import { ProfileStorySeriesScreen } from '../screens/ProfileStorySeriesScreen.js';
export function ApartmentPage({
  id,
}: {
  id: 'profile' | 'rewards' | 'friends' | 'settings' | 'story';
}) {
  const { pathname } = useLocation();
  if (id === 'story')
    return pathname.endsWith('/series-2') ? (
      <ProfileStorySeriesScreen series={2} />
    ) : pathname.endsWith('/series-1') ? (
      <ProfileStorySeriesScreen />
    ) : (
      <ProfileStoryScreen />
    );
  if (id === 'rewards') return <ProfileRewardsScreen />;
  if (id === 'friends') return pathname==='/referrals'?<ReferralsScreen/>:<ProfileFriendsScreen />;
  if (id === 'settings') return <ProfileSettingsScreen />;
  if (pathname === '/profile/stats') return <ProfileStatsScreen />;
  if (pathname === '/profile/arena') return <ProfileArenaScreen />;
  return <ProfileScreen />;
}
