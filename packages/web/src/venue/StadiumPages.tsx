import {DuelDetailsPage} from './DuelDetailsPage.js';
import { Suspense } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { DailyOverviewScreen as DailyOverview } from '../screens/DailyOverviewScreen.js';
import {
  AmateurDuelsPage as Duels,
  AmateurTournamentsPage as Tournaments,
} from '../screens/DailyScreen.js';
export function StadiumPage({ id }: { id: 'daily' | 'duels' | 'tournaments' }) {
  const navigate = useNavigate();
  const location=useLocation();
  const detailsId=new URLSearchParams(location.search).get('duel');
  if(id==='duels'&&detailsId)return <DuelDetailsPage matchId={detailsId}/>;
  return (
    <Suspense fallback={<p role="status">Загрузка…</p>}>
      {id === 'daily' ? (
        <DailyOverview />
      ) : id === 'duels' ? (
        <Duels
          onBack={() => navigate('/sections')}
          onOpenMatch={(matchId) =>
            navigate(
              `/?view=amateur&section=duels&duel=${encodeURIComponent(matchId)}&from=sections`,
            )
          }
        />
      ) : (
        <Tournaments onBack={() => navigate('/sections')} />
      )}
    </Suspense>
  );
}
