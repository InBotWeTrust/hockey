import { Navigate, useNavigate } from 'react-router-dom';
import { BeginnerStoryFlow } from '../onboarding/BeginnerStoryFlow.js';
import { AmateurStoryFlow } from '../onboarding/AmateurStoryFlow.js';
import { useOwnProfileSummary } from '../profile/useOwnProfileSummary.js';

export function ProfileStorySeriesScreen({ series = 1 }: { series?: 1 | 2 }): JSX.Element {
  const navigate = useNavigate();
  const profileQuery = useOwnProfileSummary(true, {fresh: true})

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
      ? profileQuery.data.amateurOnboardingCompleted ||
        import.meta.env.VITE_DEV_AMATEUR_STORY_UNLOCKED === 'true'
      : profileQuery.data.beginnerOnboardingCompleted)
  ) {
    return <Navigate to="/profile/story" replace />;
  }

  const returnToCatalog = () => navigate('/profile/story', { replace: true });
  if (series === 2)
    return (
      <AmateurStoryFlow
        unlockGoalsRequired={profileQuery.data.amateurUnlockGoalsRequired}
        mode="replay"
        onClose={returnToCatalog}
        onCompleted={returnToCatalog}
      />
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
