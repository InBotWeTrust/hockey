import type {PanoramaPage} from './SectionPanorama.js';

export type Level = 'beginner' | 'amateur' | 'professional' | null;
export interface VenuePage extends PanoramaPage {
  href: string;
}
export interface VenueScene {
  id: 'yard' | 'stadium' | 'tasks' | 'apartment';
  label: string;
  selected: string;
  pages: VenuePage[];
  columns: number;
  redirect?: string;
}
export const trainingHref = (section: string) => `/?view=training&section=${section}&from=sections`;
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
  const apartmentPage = apartmentPages.find(page=>page.href===pathname || (page.id==='story' && pathname.startsWith('/profile/story/')));
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
