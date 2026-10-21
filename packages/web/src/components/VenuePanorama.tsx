import { Suspense, lazy } from 'react';
import { ColumnNavigationProvider, toLocation } from '../layout/ColumnNavigation.js';
import { readColumnHistory } from '../layout/columnNavigationStore.js';
import { isGameLocation } from '../layout/gameRoutes.js';
import { useNavigationActivity } from './useNavigationActivity.js';
import { AppToast } from './AppToast.js';
import { ApartmentReferralAttention } from './ApartmentRoom.js';
import { useYardLighting } from '../city/yardLighting.js';
import type { CityTimeOfDay } from '../city/lighting.js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SectionPanorama } from './SectionPanorama.js';

import { venueSceneFor, trainingHref, type Level } from './venueScenes.js';
export { venueSceneFor } from './venueScenes.js';

const ApartmentPage = lazy(() =>
  import('../venue/ApartmentPages.js').then((m) => ({ default: m.ApartmentPage })),
);
const TaskPage = lazy(() => import('../venue/TaskPages.js').then((m) => ({ default: m.TaskPage })));
const StadiumPage = lazy(() =>
  import('../venue/StadiumPages.js').then((m) => ({ default: m.StadiumPage })),
);
const YardPage = lazy(() => import('../venue/YardPages.js').then((m) => ({ default: m.YardPage })));

interface VenueNavigation {
  onBack: () => void;
  setAttention: (id: string, attention: number) => void;
}
const VenueContext = createContext<VenueNavigation | null>(null);
export const useVenueNavigation = () => useContext(VenueContext);
export function useVenueAttention(id: string, attention: number): void {
  const update = useVenueNavigation()?.setAttention;
  useEffect(() => {
    update?.(id, attention);
  }, [update, id, attention]);
}
export function VenuePanorama({
  level,
  owner,
  children,
  previewTime,
  trainingExercisesEnabled = import.meta.env.DEV ||
    import.meta.env.VITE_TRAINING_EXERCISES_ENABLED === true,
}: {
  level: Level;
  owner: string | null;
  children: ReactNode;
  previewTime?: CityTimeOfDay | undefined;
  trainingExercisesEnabled?: boolean;
}): JSX.Element {
  const location = useLocation(),
    navigate = useNavigate();
  const [developmentToast, setDevelopmentToast] = useState(false);
  const exercisesEnabled = trainingExercisesEnabled;
  const scene = venueSceneFor(location.pathname, location.search, level);
  const yard = useYardLighting(scene?.id === 'yard', import.meta.env.DEV ? previewTime : undefined);
  const [attention, setAttention] = useState<Record<string, number>>({});
  const update = useCallback(
    (id: string, value: number) =>
      setAttention((old) => (old[id] === value ? old : { ...old, [id]: value })),
    [],
  );
  const updateReferrals = useCallback((count: number) => update('friends', count), [update]);
  const onBack = useCallback(() => navigate('/sections'), [navigate]);
  const context = useMemo(() => ({ onBack, setAttention: update }), [onBack, update]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('section') ?? (params.get('play') === '1' ? 'open' : 'course');
    if (
      !exercisesEnabled &&
      location.pathname === '/' &&
      params.get('view') === 'training' &&
      ['course', 'advanced'].includes(section)
    ) {
      setDevelopmentToast(true);
      navigate(trainingHref('open'), { replace: true });
      return;
    }
    if (scene?.redirect) navigate(scene.redirect, { replace: true });
  }, [scene?.redirect, navigate, exercisesEnabled, location.pathname, location.search]);
  if (!scene) return <>{children}</>;
  const keyFor = (pageId: string) => ({ owner: owner ?? 'guest', venueId: scene.id, pageId });
  const pageLocation = (id: string) => {
    const page = scene.pages.find((item) => item.id === id)!;
    const history = readColumnHistory(keyFor(id), toLocation(page.href));
    return history[history.length - 1]!;
  };
  const renderPage = ['stadium', 'yard', 'apartment', 'tasks'].includes(scene.id)
    ? (id: string) => {
        if (scene.id === 'yard' && ['course', 'advanced'].includes(id) && !exercisesEnabled)
          return <p className="modal-copy">В разработке</p>;
        return (
          <ColumnNavigationProvider
            key={`${owner}:${scene.id}:${id}`}
            pageKey={keyFor(id)}
            baseLocation={toLocation(scene.pages.find((page) => page.id === id)!.href)}
            initialLocation={scene.selected === id ? location : pageLocation(id)}
            active={scene.selected === id}
            onActivate={(next, options) => navigate(next, options)}
            onGame={(next) => navigate(next)}
            isGame={isGameLocation}
          >
            <Suspense fallback={<p role="status">Загрузка…</p>}>
              {scene.id === 'stadium' ? (
                <StadiumPage id={id as 'daily' | 'duels' | 'tournaments'} />
              ) : scene.id === 'yard' ? (
                <YardPage id={id as 'daily' | 'open' | 'course' | 'advanced'} />
              ) : scene.id === 'apartment' ? (
                <ApartmentPage
                  id={id as 'profile' | 'rewards' | 'friends' | 'settings' | 'story'}
                />
              ) : (
                <TaskPage
                  id={id as 'tasks' | 'challenges'}
                  profileContext={location.pathname.startsWith('/profile/')}
                />
              )}
            </Suspense>
          </ColumnNavigationProvider>
        );
      }
    : undefined;
  return (
    <VenueContext.Provider value={context}>
      {developmentToast && (
        <AppToast message="В разработке" onDismiss={() => setDevelopmentToast(false)} />
      )}
      {scene.id === 'stadium' && <StadiumDuelAttention enabled={Boolean(owner)} />}
      {scene.id === 'apartment' && <ApartmentReferralAttention onCount={updateReferrals} />}
      <SectionPanorama
        className={`venue-scene${scene.id === 'apartment' ? ` apartment-scene apartment-scene--${scene.selected}` : ''}`}
        label={scene.label}
        pages={scene.pages.map((page) => ({
          ...page,
          image: scene.id === 'yard' ? yard.thumbnail(page.position ?? 0) : page.image,
          attention: attention[page.id] ?? 0,
        }))}
        columns={scene.columns}
        {...(renderPage ? { renderPage } : {})}
        selected={scene.selected}
        onSelect={(id) => {
          const page = scene.pages.find((item) => item.id === id);
          if (scene.id === 'yard' && (id === 'course' || id === 'advanced') && !exercisesEnabled) {
            setDevelopmentToast(true);
            return;
          }
          if (page) navigate(renderPage ? pageLocation(id) : page.href, { replace: true });
        }}
        panorama={scene.id === 'yard' ? yard.panorama : `/section-panoramas/${scene.id}-v1.webp`}
        storageKey={`section-scroll:${owner ?? 'guest'}:${scene.id}`}
      >
        {scene.redirect ? <p role="status">Загрузка…</p> : children}
      </SectionPanorama>
    </VenueContext.Provider>
  );
}

function StadiumDuelAttention({ enabled }: { enabled: boolean }) {
  const { duelActionCount } = useNavigationActivity(enabled);
  useVenueAttention('duels', duelActionCount);
  return null;
}
