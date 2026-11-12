import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  camera,
  decor,
  trophyCount,
}: {
  design: ApartmentDesign;
  camera: number;
  decor: DecorCategory[];
  trophyCount: number;
}): JSX.Element {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="home-apartment__scene"
      viewBox={`${camera} -60 450 840`}
      preserveAspectRatio="xMinYMid slice"
      role="img"
      aria-label={`Квартира: ${design.title}`}
    >
      {design.layers.map((layer) => {
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
  const cameraFrame = useRef<number | null>(null);
  const stopCamera = () => {
    if (cameraFrame.current !== null) cancelAnimationFrame(cameraFrame.current);
    cameraFrame.current = null;
  };
  useEffect(() => () => stopCamera(), []);
  const dockRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate(),
    location = useLocation();
  const preferenceKey = `apartment-appearance:${owner ?? 'guest'}`;
  const [appearance, setAppearance] = useState(() => readAppearance(preferenceKey));
  const [camera, setCamera] = useState(-30);
  const clampCamera = (value: number) => {
    const bounds = panRef.current?.getBoundingClientRect();
    const width = bounds?.width || 450;
    const scale = Math.max(width / 450, (bounds?.height || 840) / 840);
    // The non-tiled room textures end at x=864. Never expose their empty edge.
    return Math.max(-30, Math.min(864 - width / scale, value));
  };
  const centerObject = (id: PageId) => {
    stopCamera();
    const surface = panRef.current;
    const target = surface?.querySelector<SVGGElement>(`[data-apartment-page="${id}"]`);
    if (!surface || !target) return;
    const bounds = surface.getBoundingClientRect();
    const width = bounds.width || 450;
    const scale = Math.max(width / 450, (bounds.height || 840) / 840);
    const destination = clampCamera(Number(target.dataset.centerX) - width / (2 * scale));
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setCamera(destination);
      return;
    }
    let start: number | null = null;
    const origin = camera;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.max(0, Math.min(1, (now - start) / 420));
      setCamera(origin + (destination - origin) * (1 - (1 - progress) ** 3));
      cameraFrame.current = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    cameraFrame.current = requestAnimationFrame(tick);
  };
  const [profileOpen, setProfileOpen] = useState(location.pathname !== '/profile'),
    [appearanceOpen, setAppearanceOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<ApartmentSettingsSection>('menu');
  const [visited, setVisited] = useState(location.pathname !== '/profile');
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | SVGElement | null>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const previousPath = useRef(location.pathname);
  const suppressClick = useRef(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    camera: number;
    locked: boolean;
  } | null>(null);
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
      ? apartmentSettingsSections.find((s) => s.id === settingsSection)!.title
      : page.title;
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      setProfileOpen(true);
      setVisited(true);
      setAppearanceOpen(false);
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
  const openPage = (id: PageId, trigger?: HTMLElement | SVGElement): void => {
    if (contentRef.current) scrollPositions.current[page.id] = contentRef.current.scrollTop;
    triggerRef.current = trigger ?? null;
    setVisited(true);
    setSettingsSection('menu');
    setAppearanceOpen(false);
    setProfileOpen(true);
    navigate(pages.find((p) => p.id === id)!.path);
  };
  const closePanel = (): void => {
    setProfileOpen(false);
    setAppearanceOpen(false);
    triggerRef.current?.focus();
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
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            stopCamera();
            e.preventDefault();
            setCamera((current) =>
              clampCamera(current + (e.key === 'ArrowLeft' ? -80 : 80)),
            );
          }
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || gesture.current) return;
          stopCamera();
          suppressClick.current = false;
          gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, camera, locked: false };
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          const dx = e.clientX - g.x,
            dy = e.clientY - g.y;
          if (!g.locked) {
            if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
              gesture.current = null;
              return;
            }
            if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            g.locked = true;
            suppressClick.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }
          const width = e.currentTarget.getBoundingClientRect().width || 360;
          setCamera(clampCamera(g.camera - (dx * 430) / width));
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          gesture.current = null;
          if (g.locked) {
            if (e.currentTarget.hasPointerCapture?.(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          gesture.current = null;
          suppressClick.current = true;
        }}
      >
        <ApartmentScene
          design={design}
          camera={camera}
          decor={appearance.decor}
          trophyCount={Math.min(9, count)}
        />
        <ApartmentObjects
          design={design}
          camera={camera}
          active={panelOpen ? page.id : null}
          onOpen={openPage}
        />
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
                aria-label="К настройкам"
                onClick={() => {
                  if (appearanceOpen) setAppearanceOpen(false);
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
