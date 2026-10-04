import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { BeginnerStoryFlow } from '../onboarding/BeginnerStoryFlow.js';
import { AmateurStoryFlow } from '../onboarding/AmateurStoryFlow.js';
import type { ProfileData } from './profileTypes.js';

export function ProfileStorySeriesScreen({ series = 1 }: { series?: 1 | 2 }): JSX.Element {
  const navigate = useNavigate();
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me', { cache: 'no-store' }),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  if (!profileQuery.isFetchedAfterMount && !profileQuery.isError) {
    return <main className="onboarding-flow onboarding-flow--status">Загружаем серию…</main>;
  }
  if (profileQuery.isError || profileQuery.data === undefined) {
    return (
      <main className="onboarding-flow onboarding-flow--status">
        <div className="onboarding-flow__status" role="alert">
          <p>Не удалось загрузить серию.</p>
          <button
            className="btn btn--cta"
            type="button"
            onClick={() => void profileQuery.refetch()}
          >
            Повторить
          </button>
        </div>
      </main>
    );
  }
  if (
    !(series === 2
      ? profileQuery.data.amateurOnboardingCompleted
      : profileQuery.data.beginnerOnboardingCompleted)
  ) {
    return <Navigate to="/profile/story" replace />;
  }

  const returnToCatalog = () => navigate('/profile/story', { replace: true });
  if (series === 2)
    return (
      <AmateurStoryFlow mode="replay" onClose={returnToCatalog} onCompleted={returnToCatalog} />
    );
  return (
    <BeginnerStoryFlow
      mode="replay"
      unlockGoalsRequired={profileQuery.data.amateurUnlockGoalsRequired}
      onClose={returnToCatalog}
      onCompleted={returnToCatalog}
    />
  );
}
