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
import { SectionPanorama, type PanoramaPage } from './SectionPanorama.js';

type Level = 'beginner' | 'amateur' | 'professional' | null;
interface VenuePage extends PanoramaPage {
  href: string;
}
interface VenueScene {
  id: 'yard' | 'stadium' | 'tasks' | 'apartment';
  label: string;
  selected: string;
  pages: VenuePage[];
  columns: number;
  redirect?: string;
}
const trainingHref = (section: string) => `/?view=training&section=${section}&from=sections`;
const stadiumHref = (section: string) => `/?view=amateur&section=${section}&from=sections`;
export function venueSceneFor(pathname: string, search: string, level: Level): VenueScene | null {
  if (level === null || pathname === '/profile/equipment') return null;
  const params = new URLSearchParams(search),
    view = params.get('view');
  const daily = pathname === '/daily';
  const apartmentPages: VenuePage[] = [
    {id:'profile',label:'Профиль',href:'/profile',position:0},
    {id:'rewards',label:'Награды',href:'/profile/rewards',position:2},
    {id:'friends',label:'Друзья',href:'/profile/friends',position:4},
    {id:'settings',label:'Настройки',href:'/profile/settings',position:3},
    {id:'story',label:'Сюжет',href:'/profile/story',position:5},
  ].map(page=>({...page,image:`/section-panoramas/apartment-${page.position}.webp`}));
  const apartmentPage = apartmentPages.find(page=>page.href===pathname);
  if (apartmentPage || ['/referrals','/profile/stats','/profile/arena'].includes(pathname))
    return {id:'apartment',label:'Квартира',columns:6,pages:apartmentPages,
      selected:pathname==='/referrals'?'friends':apartmentPage?.id??'profile'};

  if (
    pathname === '/' &&
    (params.get('play') === '1' || params.has('exercise') || params.has('match'))
  )
    return null;
  if ((pathname === '/' && view === 'training') || (daily && level === 'beginner')) {
    const pages: VenuePage[] = [
      {
        id: 'open',
        label: 'Открытая',
        href: trainingHref('open'),
        position: 3,
        image: '/section-panoramas/yard-3.webp',
      },
      {
        id: 'daily',
        label: 'Ежедневная',
        href: '/daily',
        position: 0,
        image: '/section-panoramas/yard-0.webp',
      },
      {
        id: 'course',
        label: 'Начальные',
        href: trainingHref('course'),
        position: 1,
        image: '/section-panoramas/yard-1.webp',
      },
      {
        id: 'advanced',
        label: 'Продвинутые',
        href: trainingHref('advanced'),
        position: 2,
        image: '/section-panoramas/yard-2.webp',
      },
    ].filter((page) => page.id !== 'daily' || level === 'beginner')
      .map((page, position) => ({...page, position, image: `/section-panoramas/yard-${position}.webp`}));
    const selected = daily ? 'daily' : (params.get('section') ?? 'course');
    return {
      id: 'yard',
      label: 'Двор',
      pages,
      columns: 4,
      selected,
      ...(!pages.some((page) => page.id === selected) || (!daily && !params.has('section'))
        ? { redirect: trainingHref('course') }
        : {}),
    };
  }
  if ((pathname === '/' && view === 'amateur') || (daily && level === 'amateur')) {
    const pages: VenuePage[] = [
      {
        id: 'daily',
        label: 'Ежедневная',
        href: '/daily',
        position: 0,
        image: '/section-panoramas/stadium-0.webp',
      },
      {
        id: 'duels',
        label: 'Дуэли',
        href: stadiumHref('duels'),
        position: 1,
        image: '/section-panoramas/stadium-1.webp',
      },
      {
        id: 'tournaments',
        label: 'Турниры',
        href: stadiumHref('tournaments'),
        position: 2,
        image: '/section-panoramas/stadium-2.webp',
      },
    ].filter((page) => page.id !== 'daily' || level === 'amateur');
    const selected = daily ? 'daily' : (params.get('section') ?? 'duels');
    return {
      id: 'stadium',
      label: 'Стадион',
      pages,
      columns: 3,
      selected,
      ...(!pages.some((page) => page.id === selected) || (!daily && !params.has('section'))
        ? { redirect: stadiumHref('duels') }
        : {}),
    };
  }
  if (/^\/(?:profile\/)?achievements(?:\/weekly-challenge)?$/.test(pathname)) {
    const root = pathname.startsWith('/profile/') ? '/profile/achievements' : '/achievements';
    return {
      id: 'tasks',
      label: 'Задания',
      columns: 2,
      selected: pathname.endsWith('/weekly-challenge') ? 'challenges' : 'tasks',
      pages: [
        {
          id: 'tasks',
          label: 'Задания',
          href: root,
          position: 0,
          image: '/section-panoramas/tasks-0.webp',
        },
        {
          id: 'challenges',
          label: 'Челленджи',
          href: `${root}/weekly-challenge`,
          position: 1,
          image: '/section-panoramas/tasks-1.webp',
        },
      ],
    };
  }
  return null;
}
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
  trainingExercisesEnabled = import.meta.env.DEV || import.meta.env.VITE_TRAINING_EXERCISES_ENABLED === true,
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
  const updateReferrals = useCallback((count:number)=>update('friends',count),[update]);
  const onBack = useCallback(() => navigate('/sections?home=1'), [navigate]);
  const context = useMemo(() => ({ onBack, setAttention: update }), [onBack, update]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('section') ?? (params.get('play') === '1' ? 'open' : 'course');
    if (!exercisesEnabled && location.pathname === '/' && params.get('view') === 'training' && ['course','advanced'].includes(section)) {
      setDevelopmentToast(true); navigate(trainingHref('open'), {replace:true}); return;
    }
    if (scene?.redirect) navigate(scene.redirect, { replace: true });
  }, [scene?.redirect, navigate, exercisesEnabled, location.pathname, location.search]);
  if (!scene) return <>{children}</>;
  return (
    <VenueContext.Provider value={context}>
      {developmentToast && <AppToast message="В разработке" onDismiss={() => setDevelopmentToast(false)}/>}
      <SectionPanorama
        className={`venue-scene${scene.id === 'apartment' ? ` apartment-scene apartment-scene--${scene.selected}` : ''}`}
        label={scene.label}
        pages={scene.pages.map((page) => ({
          ...page,
          image: scene.id === 'yard' ? yard.thumbnail(page.position ?? 0) : page.image,
          attention: attention[page.id] ?? 0,
        }))}
        columns={scene.columns}
        selected={scene.selected}
        onSelect={(id) => {
          const page = scene.pages.find((item) => item.id === id);
          if (scene.id === 'yard' && (id === 'course' || id === 'advanced') && !exercisesEnabled) { setDevelopmentToast(true); return; }
          if (page) navigate(page.href, { replace: true });
        }}
        panorama={scene.id === 'yard' ? yard.panorama : `/section-panoramas/${scene.id}-v1.webp`}
        storageKey={`section-scroll:${owner ?? 'guest'}:${scene.id}`}
      >
        {scene.id === 'apartment' && <ApartmentReferralAttention onCount={updateReferrals}/>}
        {scene.redirect ? <p role="status">Загрузка…</p> : children}
      </SectionPanorama>
    </VenueContext.Provider>
  );
}
