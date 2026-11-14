import { apartmentInteractiveObjects, type ApartmentShortcut } from './apartmentInteractiveObjects.js';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CircleDollarSign,
  Settings,
  Star,
  Trophy,
  UserRound,
  Users,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { PublicExperienceBadge } from '../../chat/components/UserProfileSheet.js';
import { apiFetch } from '../../api/apiFetch.js';
import { fetchReferralSummary } from '../../api/referrals.js';
import { MapExitLink } from '../../components/MapExitLink.js';
import { SectionNavigationIcon } from '../../components/SectionNavigationIcon.js';
import '../../components/navigation-geometry.css';
import '../../components/section-panorama.css';
import { getLevelLabel } from '../../screens/profileSections.js';
import type { ProfileData } from '../../screens/profileTypes.js';
import { apartmentDesigns } from './apartmentDesigns.js';
import {
  decorCategories,
  type ApartmentDesign,
  type ApartmentDesignId,
  type ApartmentImageLayer,
  type DecorCategory,
} from './apartmentTypes.js';
import './apartment-home.css';
import {
  ApartmentSettingsContext,
  ApartmentClassicPassportContext,
  apartmentSettingsSections,
  type ApartmentSettingsSection,
} from './ApartmentSettingsContext.js';
import { useHorizontalPan } from '../../bar/useHorizontalPan.js';
import { apartmentBounds, apartmentViewBox } from './apartmentTypes.js';
import { ApartmentObjects } from './ApartmentObjects.js';

const pages = [
  { id: 'profile', title: 'Профиль', path: '/profile', icon: UserRound },
  { id: 'rewards', title: 'Награды', path: '/profile/rewards', icon: Trophy },
  { id: 'friends', title: 'Друзья', path: '/profile/friends', icon: Users },
  { id: 'settings', title: 'Настройки', path: '/profile/settings', icon: Settings },
  { id: 'story', title: 'Сюжет', path: '/profile/story', icon: BookOpen },
] as const;
type PageId = (typeof pages)[number]['id'];
const decorLabels: Record<DecorCategory, string> = {
  floorlamp: 'Торшер',
  plant: 'Растение',
  pillows: 'Подушки',
  throw: 'Плед',
  audio: 'Акустика',
  poster: 'Постер',
};
interface Appearance {
  design: ApartmentDesignId;
  decor: DecorCategory[];
}
function readAppearance(key: string): Appearance {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Appearance> | null;
    return {
      design: apartmentDesigns.some((d) => d.id === stored?.design) ? stored!.design! : 'base',
      decor: Array.isArray(stored?.decor)
        ? stored.decor.filter((c) => decorCategories.includes(c))
        : [...decorCategories],
    };
  } catch {
    return { design: 'base', decor: [...decorCategories] };
  }
}

export function ApartmentScene({
  design,
  decor,
  trophyCount,
}: {
  design: ApartmentDesign;
  decor: DecorCategory[];
  trophyCount: number;
}): JSX.Element {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="home-apartment__scene"
      viewBox={apartmentViewBox}
      preserveAspectRatio="xMinYMid slice"
      role="img"
      aria-label={`Квартира: ${design.title}`}
    >
      {apartmentInteractiveObjects(design).layers.map((layer) => {
        if ('decor' in layer && layer.decor && !decor.includes(layer.decor)) return null;
        if (layer.kind === 'image-shadow') {
          const filter = `${id}-${layer.id}`;
          return (
            <g key={layer.id}>
              <defs>
                <filter id={filter} x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation={layer.blur} result="soft" />
                  <feOffset in="soft" dx={layer.dx} dy={layer.dy} result="offset" />
                  <feFlood floodColor="#43443b" floodOpacity={layer.opacity} />
                  <feComposite in2="offset" operator="in" />
                </filter>
              </defs>
              <image
                data-shadow-of={layer.id}
                href={layer.src}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                height={layer.height}
                filter={`url(#${filter})`}
              />
            </g>
          );
        }
        if (layer.kind === 'image') {
          if (layer.decor && !decor.includes(layer.decor)) return null;
          if (layer.trophyIndex !== undefined && layer.trophyIndex >= trophyCount) return null;
          return (
            <image
              key={layer.id}
              data-layer={layer.id}
              data-trophy-index={layer.trophyIndex}
              href={layer.src}
              x={layer.x}
              y={layer.y}
              width={layer.width}
              height={layer.height}
            />
          );
        }
        if (layer.kind === 'surface') {
          const clip = `${id}-${layer.id}`,
            pattern = clip + '-pattern';
          return (
            <g key={layer.id}>
              <defs>
                <clipPath id={clip}>
                  <polygon points={layer.points} />
                </clipPath>
                {layer.pattern && (
                  <pattern id={pattern} patternUnits="userSpaceOnUse" width="400" height="400">
                    <image href={layer.src} width="400" height="400" preserveAspectRatio="none" />
                  </pattern>
                )}
              </defs>
              <g clipPath={`url(#${clip})`}>
                {layer.pattern ? (
                  <rect x="-600" y="-300" width="2200" height="1500" fill={`url(#${pattern})`} />
                ) : (
                  <image
                    data-surface={layer.id}
                    href={layer.src}
                    x="-64"
                    y="-64"
                    width="928"
                    height="844"
                    preserveAspectRatio="none"
                  />
                )}
                {layer.shade > 0 && (
                  <rect
                    x="-600"
                    y="-300"
                    width="2200"
                    height="1500"
                    fill="#302719"
                    opacity={layer.shade}
                  />
                )}
              </g>
            </g>
          );
        }
        if (layer.kind === 'trim')
          return (
            <polyline
              key={layer.id}
              points={layer.points}
              stroke="#d6d0c3"
              strokeWidth="4"
              fill="none"
            />
          );
        const filter = `${id}-${layer.id}`;
        return (
          <g key={layer.id}>
            {layer.blur && (
              <defs>
                <filter id={filter} x="-100%" y="-400%" width="300%" height="900%">
                  <feGaussianBlur stdDeviation={layer.blur} />
                </filter>
              </defs>
            )}
            <ellipse
              data-shadow={layer.id}
              cx={layer.cx}
              cy={layer.cy}
              rx={layer.rx}
              ry={layer.ry}
              fill="#43443b"
              opacity={layer.opacity}
              {...(layer.blur ? { filter: `url(#${filter})` } : {})}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function ApartmentHome({
  children,
  owner,
}: {
  children: ReactNode;
  owner: string | null;
}): JSX.Element {
  const panRef = useRef<HTMLDivElement>(null);
  const pan = useHorizontalPan(panRef);
  const dockRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate(),
    location = useLocation();
  const preferenceKey = `apartment-appearance:${owner ?? 'guest'}`;
  const [appearance, setAppearance] = useState(() => readAppearance(preferenceKey));
  const [panSize, setPanSize] = useState({ width: 450, height: 840 });
  const panScale = Math.max(panSize.width / apartmentBounds.viewportWidth, panSize.height / apartmentBounds.height);
  useEffect(() => {
    const viewport = panRef.current;
    if (!viewport) return;
    const measure = () => {
      const bounds = viewport.getBoundingClientRect();
      setPanSize({ width: bounds.width || 450, height: bounds.height || 840 });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  }, []);
  const previousScale = useRef(panScale);
  useLayoutEffect(() => {
    const viewport = panRef.current;
    if (viewport && previousScale.current !== panScale) {
      viewport.scrollLeft *= panScale / previousScale.current;
    }
    previousScale.current = panScale;
  }, [panScale]);
  const clampLeft = (left: number): number => Math.max(0, Math.min(apartmentBounds.width * panScale - panSize.width, left));
  const centerObject = (id: PageId) => {
    const surface = panRef.current;
    const target = surface?.querySelector<SVGGElement>(`[data-apartment-page="${id}"]`);
    if (!surface || !target) return;
    const left = clampLeft((Number(target.dataset.centerX) - apartmentBounds.left) * panScale - panSize.width / 2);
    surface.scrollTo?.({ left, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const [profileOpen, setProfileOpen] = useState(location.pathname !== '/profile'),
    [appearanceOpen, setAppearanceOpen] = useState(false);
  const [settingsFromObject, setSettingsFromObject] = useState(false);
  const [settingsSection, setSettingsSection] = useState<ApartmentSettingsSection>('menu');
  const [visited, setVisited] = useState(location.pathname !== '/profile');
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const previousPath = useRef(location.pathname);
  const profile = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me?summary=true'),
  });
  const referrals = useQuery({ queryKey: ['referrals', 'summary'], queryFn: fetchReferralSummary });
  const referralRewards =
    referrals.data?.unclaimedRewardsCount ?? profile.data?.unclaimedReferralRewardsCount ?? 0;
  const design = apartmentDesigns.find((d) => d.id === appearance.design) ?? apartmentDesigns[0]!;
  const page =
    pages.find(
      (p) =>
        location.pathname === p.path ||
        (p.path !== '/profile' && location.pathname.startsWith(p.path + '/')),
    ) ?? pages[0];
  useEffect(() => {
    dockRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [page.id]);
  const panelOpen = profileOpen;
  const panelTitle = appearanceOpen
    ? 'Оформление квартиры'
    : page.id === 'settings' && settingsSection !== 'menu'
      ? settingsSection === 'theme' ? 'Тема приложения' : apartmentSettingsSections.find((s) => s.id === settingsSection)!.title
      : page.title;
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      setProfileOpen(true);
      setVisited(true);
    }
  }, [location.pathname]);
  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', !panelOpen);
    if (panelOpen && panelRef.current && triggerRef.current) {
      const panel = panelRef.current.getBoundingClientRect();
      const trigger = triggerRef.current.getBoundingClientRect();
      panelRef.current.style.setProperty(
        '--home-origin-x',
        `${trigger.x + trigger.width / 2 - panel.x}px`,
      );
      panelRef.current.style.setProperty(
        '--home-origin-y',
        `${trigger.y + trigger.height / 2 - panel.y}px`,
      );
    }
    if (panelOpen && contentRef.current)
      contentRef.current.scrollTop = scrollPositions.current[page.id] ?? 0;
  }, [panelOpen, page.id]);
  useEffect(() => {
    if (panelOpen) panelRef.current?.focus({ preventScroll: true });
  }, [panelOpen, page.id, appearanceOpen, settingsSection]);
  const openPage = (id: PageId, trigger?: HTMLElement | SVGElement, shortcut?: ApartmentShortcut): void => {
    const sameShortcut = shortcut === (appearanceOpen ? 'appearance' : settingsSection === 'menu' ? undefined : settingsSection);
    if (panelOpen && page.id === id && sameShortcut && trigger?.closest('.home-apartment__object')) {
      setProfileOpen(false);
      return;
    }
    if (contentRef.current) scrollPositions.current[page.id] = contentRef.current.scrollTop;
    triggerRef.current = trigger ?? null;
    setVisited(true);
    setSettingsFromObject(shortcut !== undefined);
    setSettingsSection(shortcut && shortcut !== 'appearance' ? shortcut : 'menu');
    setAppearanceOpen(shortcut === 'appearance');
    setProfileOpen(true);
    navigate(pages.find((p) => p.id === id)!.path);
  };
  const closePanel = (): void => {
    setProfileOpen(false);
    setAppearanceOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!panelOpen) return;
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !document.querySelector('[role=dialog]')) closePanel();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [panelOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(appearance));
    } catch {
      /* The preview remains usable when storage is unavailable. */
    }
  }, [appearance, preferenceKey]);
  const count = Object.values(profile.data?.trophySummary ?? {}).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? Math.max(0, value) : 0),
    0,
  );
  const number = (value: number | undefined): string =>
    typeof value === 'number' && Number.isFinite(value)
      ? new Intl.NumberFormat('ru-RU').format(value)
      : '—';
  return (
    <section
      className={`home-apartment${panelOpen ? ' home-apartment--reading' : ''}`}
      aria-label="Дом игрока"
    >
      <div
        ref={panRef}
        className="home-apartment__pan"
        role="group"
        aria-label="Перемещение по квартире"
        tabIndex={0}
        {...pan}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.currentTarget.scrollLeft = clampLeft(e.currentTarget.scrollLeft + (e.key === 'ArrowLeft' ? -80 : 80) * panScale);
          }
        }}
        onClickCapture={(e) => {
          pan.onClickCapture?.(e);
          if (e.defaultPrevented) return;
          if ((e.target as Element).closest('.home-apartment__object')) return;
          if (panelOpen) {
            e.preventDefault();
            e.stopPropagation();
            closePanel();
          }
        }}
      >
        <div className="home-apartment__scroll-world" style={{ width: apartmentBounds.width * panScale }}>
          <div className="home-apartment__scroll-stage" style={{ height: apartmentBounds.height * panScale, top: (panSize.height - apartmentBounds.height * panScale) / 2 }}>
          <ApartmentScene
            design={design}
            decor={appearance.decor}
            trophyCount={Math.min(9, count)}
          />
          <ApartmentObjects
            design={design}
            active={panelOpen ? page.id : null}
            activeShortcut={appearanceOpen ? 'appearance' : settingsSection === 'menu' ? undefined : settingsSection}
            onOpen={openPage}
            onExit={() => navigate('/sections')}
          />
          </div>
        </div>
      </div>
      <header className="home-apartment__header" hidden={panelOpen}>
        <div className="home-apartment__identity">
          <div className="public-profile-avatar home-apartment__avatar-wrap">
            <button
              className="home-apartment__avatar"
              aria-label="Открыть паспорт игрока"
              onClick={(e) => openPage('profile', e.currentTarget)}
            >
              {profile.data?.avatarUrl ? (
                <img src={profile.data.avatarUrl} alt="Аватар игрока" />
              ) : (
                <span>{profile.data?.displayName.trim().charAt(0) || <UserRound size={20} />}</span>
              )}
            </button>
            <PublicExperienceBadge experience={profile.data?.experienceBalance ?? 0} />
          </div>
          <div className="home-apartment__name">
            <strong className="profile-identity__name">{profile.data?.displayName ?? 'Мой дом'}</strong>
            <span className="profile-identity__level">
              {profile.data ? getLevelLabel(profile.data.competitionLevel) : 'Загружаем профиль…'}
            </span>
          </div>
          <div className="home-apartment__wallet" aria-label="Баланс игрока">
            {[
              {
                label: 'Монеты',
                value: profile.data?.currencyBalance,
                icon: CircleDollarSign,
                tone: 'coins',
              },
              { label: 'Звёзды', value: profile.data?.starBalance, icon: Star, tone: 'stars' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div
                key={label}
                className={`profile-balance__amount profile-balance__amount--${tone}`}
                aria-label={`${label}: ${number(value)}`}
              >
                <Icon
                  size={15}
                  aria-hidden="true"
                  {...(tone === 'stars' ? { fill: 'currentColor' } : {})}
                />
                <strong>{number(value)}</strong>
              </div>
            ))}
          </div>
        </div>
        {profile.isError && (
          <div className="home-apartment__error" role="alert">
            Не удалось загрузить профиль.{' '}
            <button onClick={() => void profile.refetch()}>Повторить</button>
          </div>
        )}
      </header>
      <section
        className="section-scene__panel home-apartment__navigation"
        aria-label="Навигация: Квартира"
      >
        <div className="section-scene__identity">
          <strong>{panelOpen ? page.title : 'Квартира'}</strong>
        </div>
        <div className="section-scene__navigation">
          <MapExitLink className="section-scene__exit">
            <span><ArrowLeft size={22} aria-hidden="true" /></span>
            <small>Назад</small>
          </MapExitLink>
          <div
            ref={dockRef}
            className="section-scene__dock"
            role="tablist"
            aria-label="Разделы: Квартира"
          >
            {pages.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-label={p.title}
                aria-selected={panelOpen && page.id === p.id}
                onClick={(e) => {
                  if (panelOpen && page.id === p.id) closePanel();
                  else {
                    centerObject(p.id);
                    openPage(p.id, e.currentTarget);
                  }
                }}
              >
                <SectionNavigationIcon id={p.id} label={p.title} />
                <span>{p.title}</span>
                {p.id === 'friends' && referralRewards > 0 && (
                  <span className="section-scene__attention" aria-label="Есть награды за приглашения">
                    {referralRewards}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
      {visited && (
        <section
          ref={panelRef}
          tabIndex={-1}
          className={`home-apartment-panel${page.id === 'profile' ? ' home-apartment-panel--passport' : ''}${page.id === 'settings' ? ' home-apartment-panel--settings' : ''}${panelOpen ? ' is-open' : ''}`}
          aria-label={panelTitle}
          aria-hidden={!panelOpen}
        >
          {(appearanceOpen || (page.id === 'settings' && settingsSection !== 'menu')) && (
            <div className="home-apartment-panel__header">
              <button
                className="icon-btn"
                aria-label={settingsFromObject ? 'Закрыть раздел' : 'К настройкам'}
                onClick={() => {
                  if (settingsFromObject) closePanel();
                  else if (appearanceOpen) setAppearanceOpen(false);
                  else setSettingsSection('menu');
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <strong className="home-apartment__settings-title">{panelTitle}</strong>
            </div>
          )}
          <div
            ref={contentRef}
            className="home-apartment-panel__scroll"
            onScroll={(e) => {
              if (!appearanceOpen) scrollPositions.current[page.id] = e.currentTarget.scrollTop;
            }}
          >
            <div hidden={appearanceOpen} className="home-apartment-panel__content apartment-scene">
              {page.id === 'settings' && !appearanceOpen && settingsSection === 'menu' && (
                <nav className="home-apartment__settings-menu" aria-label="Разделы настроек">
                  {apartmentSettingsSections.map((s) => (
                    <button key={s.id} onClick={() => setSettingsSection(s.id)}>
                      <strong>{s.title}</strong>
                      <span>{s.hint}</span>
                      <ChevronRight className="home-apartment__settings-chevron" size={20} aria-hidden="true" />
                    </button>
                  ))}
                  <button onClick={() => setAppearanceOpen(true)}>
                    <strong>Оформление квартиры</strong>
                    <span>Мебель и декор</span>
                    <ChevronRight className="home-apartment__settings-chevron" size={20} aria-hidden="true" />
                  </button>
                </nav>
              )}
              <ApartmentSettingsContext.Provider
                value={page.id === 'settings' ? settingsSection : null}
              >
                <ApartmentClassicPassportContext.Provider value={page.id === 'profile'}>
                  {children}
                </ApartmentClassicPassportContext.Provider>
              </ApartmentSettingsContext.Provider>
            </div>
            {appearanceOpen && (
              <div className="home-apartment-panel__appearance">
                <p className="modal-copy">
                  Выбор сохраняется только на этом устройстве. Покупки пока не подключены.
                </p>
                <div className="home-apartment__designs" role="group" aria-label="Дизайн квартиры">
                  {apartmentDesigns.map((d) => (
                    <button
                      key={d.id}
                      aria-pressed={appearance.design === d.id}
                      onClick={() => setAppearance((a) => ({ ...a, design: d.id }))}
                    >
                      <img
                        src={
                          d.layers.find(
                            (l): l is ApartmentImageLayer => l.kind === 'image' && l.id === 'sofa',
                          )?.src
                        }
                        alt=""
                      />
                      <strong>{d.title}</strong>
                      <small>{d.description}</small>
                    </button>
                  ))}
                </div>
                <fieldset className="home-apartment__decor">
                  <legend>Декор</legend>
                  {decorCategories.map((c) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={appearance.decor.includes(c)}
                        onChange={(e) =>
                          setAppearance((a) => ({
                            ...a,
                            decor: e.target.checked
                              ? [...a.decor, c]
                              : a.decor.filter((v) => v !== c),
                          }))
                        }
                      />
                      {decorLabels[c]}
                    </label>
                  ))}
                </fieldset>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
