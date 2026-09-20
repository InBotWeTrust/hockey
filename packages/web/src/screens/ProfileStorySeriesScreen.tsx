import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { BeginnerStoryFlow } from '../onboarding/BeginnerStoryFlow.js';
import type { ProfileData } from './profileTypes.js';

export function ProfileStorySeriesScreen(): JSX.Element {
  const navigate = useNavigate();
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me', { cache: 'no-store' }),
  });

  if (profileQuery.isLoading) {
    return <main className="onboarding-flow onboarding-flow--status">Загружаем серию…</main>;
  }
  if (profileQuery.isError || profileQuery.data === undefined) {
    return (
      <main className="onboarding-flow onboarding-flow--status">
        <div className="onboarding-flow__status" role="alert">
          <p>Не удалось загрузить серию.</p>
          <button className="btn btn--cta" type="button" onClick={() => void profileQuery.refetch()}>
            Повторить
          </button>
        </div>
      </main>
    );
  }
  if (!profileQuery.data.beginnerOnboardingCompleted) {
    return <Navigate to="/profile/story" replace />;
  }

  const returnToCatalog = () => navigate('/profile/story', { replace: true });
  return (
    <BeginnerStoryFlow
      mode="replay"
      unlockGoalsRequired={profileQuery.data.amateurUnlockGoalsRequired}
      onClose={returnToCatalog}
      onCompleted={returnToCatalog}
    />
  );
}
