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
  id: 'yard' | 'stadium' | 'tasks';
  label: string;
  selected: string;
  pages: VenuePage[];
  columns: number;
  redirect?: string;
}
const trainingHref = (section: string) => `/?view=training&section=${section}&from=sections`;
const stadiumHref = (section: string) => `/?view=amateur&section=${section}&from=sections`;
export function venueSceneFor(pathname: string, search: string, level: Level): VenueScene | null {
  if (level === null) return null;
  const params = new URLSearchParams(search),
    view = params.get('view');
  const daily = pathname === '/daily';
  if (
    pathname === '/' &&
    (params.get('play') === '1' || params.has('exercise') || params.has('match'))
  )
    return null;
  if ((pathname === '/' && view === 'training') || (daily && level === 'beginner')) {
    const pages: VenuePage[] = [
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
      {
        id: 'open',
        label: 'Открытая',
        href: trainingHref('open'),
        position: 3,
        image: '/section-panoramas/yard-3.webp',
      },
    ].filter((page) => page.id !== 'daily' || level === 'beginner');
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
  setAttention: (id: string, attention: boolean) => void;
}
const VenueContext = createContext<VenueNavigation | null>(null);
export const useVenueNavigation = () => useContext(VenueContext);
export function useVenueAttention(id: string, attention: boolean): void {
  const update = useVenueNavigation()?.setAttention;
  useEffect(() => {
    update?.(id, attention);
  }, [update, id, attention]);
}
export function VenuePanorama({
  level,
  owner,
  children,
}: {
  level: Level;
  owner: string | null;
  children: ReactNode;
}): JSX.Element {
  const location = useLocation(),
    navigate = useNavigate();
  const scene = venueSceneFor(location.pathname, location.search, level);
  const [attention, setAttention] = useState<Record<string, boolean>>({});
  const update = useCallback(
    (id: string, value: boolean) =>
      setAttention((old) => (old[id] === value ? old : { ...old, [id]: value })),
    [],
  );
  const onBack = useCallback(() => navigate('/sections?home=1'), [navigate]);
  const context = useMemo(() => ({ onBack, setAttention: update }), [onBack, update]);
  useEffect(() => {
    if (scene?.redirect) navigate(scene.redirect, { replace: true });
  }, [scene?.redirect, navigate]);
  if (!scene) return <>{children}</>;
  return (
    <VenueContext.Provider value={context}>
      <SectionPanorama
        className="venue-scene"
        label={scene.label}
        pages={scene.pages.map((page) => ({ ...page, attention: attention[page.id] ?? false }))}
        columns={scene.columns}
        selected={scene.selected}
        onSelect={(id) => {
          const page = scene.pages.find((item) => item.id === id);
          if (page) navigate(page.href, { replace: true });
        }}
        panorama={`/section-panoramas/${scene.id}-v1.webp`}
        storageKey={`section-scroll:${owner ?? 'guest'}:${scene.id}`}
      >
        {scene.redirect ? <p role="status">Загрузка…</p> : children}
      </SectionPanorama>
    </VenueContext.Provider>
  );
}
