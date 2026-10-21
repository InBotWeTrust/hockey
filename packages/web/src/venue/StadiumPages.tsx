import { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { DailyOverviewScreen as DailyOverview } from '../screens/DailyOverviewScreen.js';
import {
  AmateurDuelsPage as Duels,
  AmateurTournamentsPage as Tournaments,
} from '../screens/DailyScreen.js';
export function StadiumPage({ id }: { id: 'daily' | 'duels' | 'tournaments' }) {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<p role="status">Загрузка…</p>}>
      {id === 'daily' ? (
        <DailyOverview />
      ) : id === 'duels' ? (
        <Duels
          onBack={() => navigate('/sections')}
          onOpenMatch={(matchId) =>
            navigate(
              `/?view=amateur&section=duels&match=${encodeURIComponent(matchId)}&play=1&from=sections`,
            )
          }
        />
      ) : (
        <Tournaments onBack={() => navigate('/sections')} />
      )}
    </Suspense>
  );
}
