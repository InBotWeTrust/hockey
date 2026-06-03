import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Settings, Star, TrendingUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import {
  fetchMyInventory,
  patchEquipment,
  type InventoryEquipmentKind,
  type InventoryItem,
  type InventoryState,
} from '../api/inventory.js';
import { useAuthStore } from '../auth/authStore.js';
import type { ProfileAchievement, ProfileData } from './profileTypes.js';
import {
  AchievementTile,
  AchievementDetailsSheet,
  EMPTY_PROFILE_STATS,
  formatProfileNumber,
  getLevelLabel,
  ProfileStatsGrid,
} from './profileSections.js';
import { artworkForInventoryItem } from './inventoryArtwork.js';
import { formatInventoryStockLabel } from './inventoryResourceLabels.js';

const LOCKER_IMAGE_WIDTH = 853;
const LOCKER_IMAGE_HEIGHT = 1844;

const LOCKER_HOTSPOTS = {
  stick: { x: 92, y: 385 },
  skates: { x: 675, y: 1392 },
  puck: { x: 96, y: 1508 },
  achievements: { x: 748, y: 560 },
  nutrition: { x: 748, y: 1040 },
} satisfies Record<string, { x: number; y: number }>;

const LOCKER_PROPS = {
  jersey: { x: 232, y: 430, width: 388 },
  stick: { x: 112, y: 565, width: 420 },
  skates: { x: 560, y: 1302, width: 270 },
  achievementMedals: { x: 676, y: 472, width: 154 },
  rinkPhoto: { x: 686, y: 825, width: 150 },
  nutritionCans: { x: 705, y: 1010, width: 115 },
} satisfies Record<string, { x: number; y: number; width: number }>;

function lockerHotspotStyle(position: { x: number; y: number }): CSSProperties {
  return {
    '--hotspot-x': `${(position.x / LOCKER_IMAGE_WIDTH) * 100}%`,
    '--hotspot-y': `${(position.y / LOCKER_IMAGE_HEIGHT) * 100}%`,
  } as CSSProperties;
}

function lockerPropStyle(position: { x: number; y: number; width: number }): CSSProperties {
  return {
    left: `${(position.x / LOCKER_IMAGE_WIDTH) * 100}%`,
    top: `${(position.y / LOCKER_IMAGE_HEIGHT) * 100}%`,
    width: `${(position.width / LOCKER_IMAGE_WIDTH) * 100}%`,
  };
}

function canStartMouseDragScroll(target: EventTarget | null): boolean {
  return (
    !(target instanceof Element) ||
    target.closest('[data-no-drag-scroll], button, a, input, textarea, select') === null
  );
}

function ProfileResourceChip({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: RewardTone;
}): JSX.Element {
  const displayValue = formatProfileNumber(value);
  const visualLength = displayValue.replace(/\s/g, '').length;
  const fontSize =
    visualLength >= 12 ? 6 : visualLength >= 9 ? 7 : visualLength >= 7 ? 8 : visualLength >= 5 ? 10 : 11;
  const iconSize =
    visualLength >= 12 ? 7 : visualLength >= 9 ? 8 : visualLength >= 7 ? 9 : visualLength >= 5 ? 12 : 14;
  const gap = visualLength >= 5 ? 2 : 4;
  return (
    <span
      aria-label={`${label}: ${value}`}
      title={`${label}: ${formatProfileNumber(value)}`}
      style={{
        minWidth: 0,
        height: 18,
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        fontSize,
        fontWeight: 900,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        flex: '0 1 auto',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: iconSize,
          height: iconSize,
          display: 'inline-flex',
          flex: `0 0 ${iconSize}px`,
          alignItems: 'center',
          justifyContent: 'center',
          color: rewardColor(tone),
        }}
      >
        <span style={{ display: 'inline-flex', transform: `scale(${iconSize / 14})` }}>{icon}</span>
      </span>
      <span style={{ color: 'var(--ink)' }}>{displayValue}</span>
    </span>
  );
}

const EQUIPMENT_META: Record<
  InventoryEquipmentKind,
  { title: string; empty: string; patchKey: 'stickItemId' | 'skatesItemId' | 'nutritionItemId' }
> = {
  stick: { title: 'Клюшка', empty: 'Без клюшки', patchKey: 'stickItemId' },
  skates: { title: 'Коньки', empty: 'Без коньков', patchKey: 'skatesItemId' },
  nutrition: { title: 'Питание', empty: 'Без питания', patchKey: 'nutritionItemId' },
};

function equipmentIdFor(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): string | null {
  if (!inventory) return null;
  if (kind === 'stick') return inventory.equipped.stickItemId;
  if (kind === 'skates') return inventory.equipped.skatesItemId;
  return inventory.equipped.nutritionItemId;
}

function equippedItem(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): InventoryItem | null {
  const id = equipmentIdFor(inventory, kind);
  return inventory?.items[kind].find((item) => item.id === id) ?? null;
}

function isRequiredEquipment(kind: InventoryEquipmentKind): boolean {
  return kind === 'stick' || kind === 'skates';
}

function baseEquipmentTitle(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') return 'Обычная клюшка';
  if (kind === 'skates') return 'Обычные коньки';
  return 'Без питания';
}

function baseEquipmentDescription(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') return 'Базовая клюшка доступна всегда и не расходуется в дуэлях.';
  if (kind === 'skates') return 'Базовые коньки доступны всегда и не расходуются в дуэлях.';
  return 'Можно выйти на матч без спортивного питания.';
}

function isAvailableLockerItem(item: InventoryItem): boolean {
  return item.chargesAvailable + item.chargesReserved > 0;
}

function hasOwnedNutrition(inventory: InventoryState | undefined): boolean {
  return (inventory?.items.nutrition ?? []).some(isAvailableLockerItem);
}

function formatReservedLabel(count: number): string | null {
  const normalized = Math.max(0, Math.trunc(count));
  if (normalized === 0) return null;

  const mod10 = normalized % 10;
  const mod100 = normalized % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'забронирован'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'забронировано'
        : 'забронировано';
  return `${normalized} ${noun}`;
}

function equipmentEffectLabel(kind: InventoryEquipmentKind, powerScore: number): string {
  if (kind === 'stick') return `Бросок +${powerScore}`;
  if (kind === 'skates') return `Скорость +${powerScore}`;
  return `Энергия +${powerScore}`;
}

function equipmentDisplayTitle(item: InventoryItem): string {
  const normalized = item.title.trim().toLowerCase();
  const isGenericTitle = new Set(['клюшка', 'клюшки', 'коньки', 'питание', 'энергия']).has(
    normalized,
  );
  if (!isGenericTitle) return item.title;

  const tier = item.rarity === 'legendary' || item.rarity === 'epic' ? 'gold' : item.rarity;
  if (item.kind === 'stick') {
    if (tier === 'gold') return 'Золотая клюшка';
    if (tier === 'rare') return 'Серебряная клюшка';
    return 'Бронзовая клюшка';
  }
  if (item.kind === 'skates') {
    if (tier === 'gold') return 'Золотые коньки';
    if (tier === 'rare') return 'Серебряные коньки';
    return 'Бронзовые коньки';
  }
  if (tier === 'gold') return 'Золотое питание';
  if (tier === 'rare') return 'Серебряное питание';
  return 'Бронзовое питание';
}

function equipmentHotspotLabel(
  kind: InventoryEquipmentKind,
  inventory: InventoryState | undefined,
): string {
  const meta = EQUIPMENT_META[kind];
  const items = (inventory?.items[kind] ?? []).filter(isAvailableLockerItem);
  const activeItem = equippedItem(inventory, kind);
  const hasOwnedItems = items.length > 0;
  const hasBaseEquipment = isRequiredEquipment(kind);
  const status = activeItem
    ? formatInventoryStockLabel(activeItem)
    : hasBaseEquipment
      ? 'Базовая'
      : hasOwnedItems
        ? 'Выбрать'
        : 'Нет купленных';
  const title = activeItem
    ? equipmentDisplayTitle(activeItem)
    : hasBaseEquipment
      ? baseEquipmentTitle(kind)
      : meta.empty;
  return `${meta.title}: ${title}. ${status}`;
}

function ProfileLockerIcon({ src }: { src: string }): JSX.Element {
  return (
    <img className="profile-locker-hotspot-icon" src={src} alt="" aria-hidden="true" />
  );
}

function ProfileLockerHotspotButton({
  className,
  label,
  badge,
  style,
  onClick,
  children,
}: {
  className: string;
  label: string;
  badge?: number;
  style?: CSSProperties;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`profile-locker-hotspot ${className}`}
      data-no-drag-scroll="true"
      aria-label={label}
      style={style}
      onClick={onClick}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="profile-locker-hotspot__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

function ProfileLockerIdentityCard({
  data,
  initial,
  tokenBalance,
  starBalance,
  experienceBalance,
  onSettingsClick,
}: {
  data: ProfileData | undefined;
  initial: string;
  tokenBalance: number;
  starBalance: number;
  experienceBalance: number;
  onSettingsClick: () => void;
}): JSX.Element {
  return (
    <div className="profile-locker-id-card">
      <div className="profile-locker-id-avatar">
        {data?.avatarUrl ? (
          <img src={data.avatarUrl} alt="avatar" />
        ) : (
          <div className="profile-locker-id-initial">{initial}</div>
        )}
      </div>
      <div className="profile-locker-id-main">
        <div className="profile-locker-resources">
          <ProfileResourceChip
            label="Монеты"
            value={tokenBalance}
            icon={<CircleDollarSign size={14} strokeWidth={2.55} />}
            tone="coin"
          />
          <ProfileResourceChip
            label="Звёзды"
            value={starBalance}
            icon={<Star size={14} strokeWidth={2.55} fill="currentColor" />}
            tone="star"
          />
          <ProfileResourceChip
            label="Опыт"
            value={experienceBalance}
            icon={<TrendingUp size={14} strokeWidth={2.55} />}
            tone="experience"
          />
        </div>
        <div className="profile-locker-name">{data?.displayName ?? '-'}</div>
        <div className="profile-locker-status">Уровень: {getLevelLabel(data?.competitionLevel)}</div>
      </div>
      <button
        type="button"
        className="icon-btn profile-locker-settings-button"
        data-no-drag-scroll="true"
        aria-label="Настройки профиля"
        onClick={onSettingsClick}
      >
        <Settings size={24} strokeWidth={2.05} />
      </button>
    </div>
  );
}

function ProfileStatsModal({
  stats,
  onClose,
}: {
  stats: ProfileData['stats'];
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label="Статистика"
        className="modal-card profile-locker-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn profile-locker-modal-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <X size={15} />
        </button>
        <div className="profile-locker-modal-header">
          <div className="modal-title">Статистика</div>
          <div className="modal-copy">Основные показатели игрока.</div>
        </div>
        <ProfileStatsGrid stats={stats} columns={2} style={{ margin: 0 }} />
      </section>
    </div>
  );
}

function ProfileAchievementsModal({
  achievements,
  unclaimedCount,
  onOpenAchievement,
  onOpenAchievementsPage,
  onClose,
}: {
  achievements: ProfileAchievement[];
  unclaimedCount: number;
  onOpenAchievement: (achievement: ProfileAchievement) => void;
  onOpenAchievementsPage: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label="Достижения"
        className="modal-card profile-locker-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn profile-locker-modal-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <X size={15} />
        </button>
        <div className="profile-locker-modal-header">
          <div className="modal-title">Достижения ({achievements.length})</div>
        </div>
        {achievements.length > 0 ? (
          <div className="profile-locker-achievement-grid">
            {achievements.map((achievement) => (
              <AchievementTile
                key={achievement.id}
                achievement={achievement}
                onOpen={() => onOpenAchievement(achievement)}
              />
            ))}
          </div>
        ) : (
          <div className="profile-locker-empty-copy">Достижений пока нет.</div>
        )}
        {unclaimedCount > 0 && (
          <button
            type="button"
            className="btn btn--cta modal-primary"
            data-no-drag-scroll="true"
            onClick={onOpenAchievementsPage}
          >
            Награды ждут получения: {unclaimedCount}
          </button>
        )}
      </section>
    </div>
  );
}

function EquipmentDetailsModal({
  kind,
  inventory,
  isSaving,
  error,
  onSelect,
  onOpenShop,
  onClose,
}: {
  kind: InventoryEquipmentKind;
  inventory: InventoryState | undefined;
  isSaving: boolean;
  error: string | null;
  onSelect: (itemId: string | null) => void;
  onOpenShop: () => void;
  onClose: () => void;
}): JSX.Element {
  const meta = EQUIPMENT_META[kind];
  const items = (inventory?.items[kind] ?? []).filter(isAvailableLockerItem);
  const activeId = equipmentIdFor(inventory, kind);
  const baseSelected = activeId === null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label={meta.title}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(430px, calc(100vw - 28px))',
          display: 'grid',
          gap: 14,
          position: 'relative',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 14 }}
        >
          <X size={15} />
        </button>
        <div style={{ minWidth: 0, paddingRight: 42 }}>
          <div className="modal-title">{meta.title}</div>
          <div className="modal-copy">Купленные расходники для активного слота.</div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <button
            type="button"
            data-no-drag-scroll="true"
            disabled={isSaving}
            onClick={() => onSelect(null)}
            className={baseSelected ? 'glass-dark' : 'glass'}
            aria-pressed={baseSelected}
            style={{
              borderRadius: 18,
              padding: 12,
              color: baseSelected ? '#ffffff' : 'var(--ink)',
              border: baseSelected
                ? '1px solid rgba(15, 23, 42, 0.22)'
                : '1px solid rgba(255,255,255,0.76)',
              background: baseSelected ? 'rgba(15, 23, 42, 0.74)' : 'rgba(255,255,255,0.22)',
              display: 'block',
              alignItems: 'center',
              textAlign: 'left',
              cursor: isSaving ? 'wait' : 'pointer',
              boxShadow: baseSelected
                ? '0 14px 26px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.2)'
                : '0 8px 18px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.74)',
            }}
          >
            <span style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 900 }}>{baseEquipmentTitle(kind)}</span>
              <span
                style={{
                  color: baseSelected ? 'rgba(255,255,255,0.72)' : 'rgba(15, 23, 42, 0.62)',
                  fontSize: 12,
                  fontWeight: 760,
                  lineHeight: 1.28,
                }}
              >
                {baseEquipmentDescription(kind)}
              </span>
            </span>
          </button>

          {items.map((item) => {
            const selected = item.id === activeId;
            const reservedLabel = formatReservedLabel(item.chargesReserved);
            const displayTitle = equipmentDisplayTitle(item);
            return (
              <button
                key={item.id}
                type="button"
                data-no-drag-scroll="true"
                disabled={isSaving || item.chargesAvailable <= 0}
                onClick={() => onSelect(item.id)}
                aria-pressed={selected}
                className={selected ? 'glass-dark' : 'glass'}
                style={{
                  borderRadius: 24,
                  padding: 14,
                  color: selected ? '#ffffff' : 'var(--ink)',
                  border: selected
                    ? '1px solid rgba(15, 23, 42, 0.22)'
                    : '1px solid rgba(255,255,255,0.76)',
                  background: selected
                    ? 'rgba(15, 23, 42, 0.74)'
                    : 'rgba(255,255,255,0.22)',
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  alignItems: 'start',
                  gap: 12,
                  textAlign: 'left',
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: item.chargesAvailable > 0 ? 1 : 0.55,
                  boxShadow: selected
                    ? '0 14px 26px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.2)'
                    : '0 8px 18px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.74)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 22,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.8)',
                    background: 'rgba(255,255,255,0.28)',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.8), 0 10px 18px rgba(15,23,42,0.12)',
                  }}
                >
                  <img
                    src={artworkForInventoryItem(item)}
                    alt=""
                    style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                  />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        color: selected ? '#ffffff' : 'var(--ink)',
                        fontSize: 18,
                        fontWeight: 950,
                        lineHeight: 1.08,
                        overflowWrap: 'break-word',
                      }}
                    >
                      {displayTitle}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 7,
                      fontSize: 12,
                      fontWeight: 760,
                      lineHeight: 1.28,
                      color: selected ? 'rgba(255,255,255,0.72)' : 'rgba(15, 23, 42, 0.62)',
                    }}
                  >
                    {item.description}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      marginTop: 12,
                    }}
                  >
                    <span
                      className="pill"
                      style={{ height: 26, justifyContent: 'center', fontSize: 11 }}
                    >
                      {formatInventoryStockLabel(item)}
                    </span>
                    <span
                      className="pill"
                      style={{ height: 26, justifyContent: 'center', fontSize: 11 }}
                    >
                      {equipmentEffectLabel(kind, item.powerScore)}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 10,
                      fontSize: 11,
                      fontWeight: 850,
                      color: selected ? 'rgba(255,255,255,0.72)' : 'rgba(15, 23, 42, 0.66)',
                    }}
                  >
                    {item.duelPeriodCost > 0 && <span>Расход: {item.duelPeriodCost}/период</span>}
                    <span>Цена: {item.currencyPrice}</span>
                    {reservedLabel !== null && <span>{reservedLabel}</span>}
                  </span>
                </span>
              </button>
            );
          })}

          {items.length === 0 && (
            <div
              className="glass"
              style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 10 }}
            >
              <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 800 }}>
                Купленных предметов этого типа пока нет.
              </div>
              <button
                type="button"
                className="btn btn--cta modal-primary"
                onClick={onOpenShop}
                style={{
                  marginTop: 6,
                }}
              >
                В магазин
              </button>
            </div>
          )}
        </div>

        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

export function ProfileScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const lockerSceneRef = useRef<HTMLElement | null>(null);
  const dragScrollRef = useRef<{ startY: number; scrollTop: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [lockerHotspotLayerStyle, setLockerHotspotLayerStyle] = useState<CSSProperties>({});
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);
  const [selectedLockerModal, setSelectedLockerModal] = useState<
    'stats' | 'achievements' | null
  >(null);
  const [selectedEquipmentKind, setSelectedEquipmentKind] = useState<InventoryEquipmentKind | null>(
    null,
  );

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
    enabled: data !== undefined,
  });
  const equipmentMut = useMutation<
    InventoryState,
    Error,
    { kind: InventoryEquipmentKind; itemId: string | null }
  >({
    mutationFn: ({ kind, itemId }) => patchEquipment({ [EQUIPMENT_META[kind].patchKey]: itemId }),
    onSuccess: (inventory) => {
      queryClient.setQueryData(['inventory', 'me'], inventory);
    },
  });

  useEffect(() => {
    if (data) {
      updateUser({
        grip: data.grip,
        displayName: data.displayName,
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.displaySource !== undefined ? { displaySource: data.displaySource } : {}),
        ...(data.linkedProviders !== undefined ? { linkedProviders: data.linkedProviders } : {}),
      });
    }
  }, [data, updateUser]);

  useEffect(() => {
    const scene = lockerSceneRef.current;
    if (scene === null) return undefined;

    const updateLayer = (): void => {
      const { width, height } = scene.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;

      const scale = Math.max(width / LOCKER_IMAGE_WIDTH, height / LOCKER_IMAGE_HEIGHT);
      const renderedWidth = LOCKER_IMAGE_WIDTH * scale;
      const renderedHeight = LOCKER_IMAGE_HEIGHT * scale;

      setLockerHotspotLayerStyle({
        width: renderedWidth,
        height: renderedHeight,
        left: (width - renderedWidth) / 2,
        top: (height - renderedHeight) / 2,
      });
    };

    updateLayer();
    window.addEventListener('resize', updateLayer);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateLayer);
      resizeObserver.observe(scene);
    }

    return () => {
      window.removeEventListener('resize', updateLayer);
      resizeObserver?.disconnect();
    };
  }, [isLoading]);

  if (isLoading) {
    return (
      <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка...</div>
      </main>
    );
  }

  const initial = (data?.displayName ?? '?').charAt(0).toUpperCase();
  const stats = data?.stats ?? EMPTY_PROFILE_STATS;
  const achievements = data?.achievements ?? [];
  const unlockedAchievementsCount = achievements.filter((achievement) => achievement.isUnlocked).length;
  const unclaimedAchievementsCount = data?.unclaimedAchievementsCount ?? 0;
  const tokenBalance = inventoryQuery.data?.balances.tokens ?? data?.currencyBalance ?? 0;
  const starBalance = inventoryQuery.data?.balances.stars ?? data?.starBalance ?? 0;
  const experienceBalance =
    inventoryQuery.data?.balances.experience ?? data?.experienceBalance ?? 0;
  const showNutritionCans = hasOwnedNutrition(inventoryQuery.data);
  const jerseyArtworkSrc =
    data?.competitionLevel === 'beginner'
      ? '/inventory/profile-hoodie-training.webp'
      : '/inventory/profile-jersey-hanger.webp';

  function handlePointerDown(event: PointerEvent<HTMLElement>): void {
    if (
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      !canStartMouseDragScroll(event.target)
    ) {
      return;
    }

    dragScrollRef.current = {
      startY: event.clientY,
      scrollTop: event.currentTarget.scrollTop,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>): void {
    const drag = dragScrollRef.current;
    if (drag === null || event.pointerType !== 'mouse') return;

    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > 4) {
      suppressClickRef.current = true;
      event.preventDefault();
    }
    event.currentTarget.scrollTop = drag.scrollTop - deltaY;
  }

  function handlePointerEnd(event: PointerEvent<HTMLElement>): void {
    dragScrollRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  return (
    <main
      className="screen profile-locker-screen"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <section ref={lockerSceneRef} className="profile-locker-scene" aria-label="Раздевалка игрока">
        <img className="profile-locker-bg" src="/inventory/profile-locker-empty.webp" alt="" />
        <div className="profile-locker-vignette" />
        <ProfileLockerIdentityCard
          data={data}
          initial={initial}
          tokenBalance={tokenBalance}
          starBalance={starBalance}
          experienceBalance={experienceBalance}
          onSettingsClick={() => navigate('/profile/settings')}
        />
        <div className="profile-locker-hotspot-layer" style={lockerHotspotLayerStyle}>
          <img
            className="profile-locker-prop profile-locker-prop--jersey"
            src={jerseyArtworkSrc}
            alt=""
            style={lockerPropStyle(LOCKER_PROPS.jersey)}
          />
          <img
            className="profile-locker-prop profile-locker-prop--stick"
            src="/inventory/profile-hockey-stick.webp"
            alt=""
            style={lockerPropStyle(LOCKER_PROPS.stick)}
          />
          <img
            className="profile-locker-prop profile-locker-prop--skates"
            src="/inventory/profile-black-skates.webp"
            alt=""
            style={lockerPropStyle(LOCKER_PROPS.skates)}
          />
          {unlockedAchievementsCount > 0 && (
            <img
              className="profile-locker-prop profile-locker-prop--achievement-medals"
              src="/inventory/profile-achievement-medals.webp"
              alt=""
              style={lockerPropStyle(LOCKER_PROPS.achievementMedals)}
            />
          )}
          <img
            className="profile-locker-prop profile-locker-prop--rink-photo"
            src="/inventory/profile-rink-photo-frame.webp"
            alt=""
            style={lockerPropStyle(LOCKER_PROPS.rinkPhoto)}
          />
          {showNutritionCans && (
            <img
              className="profile-locker-prop profile-locker-prop--nutrition-cans"
              src="/inventory/profile-nutrition-cans.webp"
              alt=""
              style={lockerPropStyle(LOCKER_PROPS.nutritionCans)}
            />
          )}
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--stick"
            label={equipmentHotspotLabel('stick', inventoryQuery.data)}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.stick)}
            onClick={() => setSelectedEquipmentKind('stick')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-stick.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--skates"
            label={equipmentHotspotLabel('skates', inventoryQuery.data)}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.skates)}
            onClick={() => setSelectedEquipmentKind('skates')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-skates.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--nutrition"
            label={equipmentHotspotLabel('nutrition', inventoryQuery.data)}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.nutrition)}
            onClick={() => setSelectedEquipmentKind('nutrition')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-nutrition.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--achievements"
            label={`Достижения: ${unlockedAchievementsCount} получено`}
            badge={unclaimedAchievementsCount}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.achievements)}
            onClick={() => setSelectedLockerModal('achievements')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-medal.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--puck"
            label="Шайба: статистика"
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.puck)}
            onClick={() => setSelectedLockerModal('stats')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-puck.webp" />
          </ProfileLockerHotspotButton>
        </div>
      </section>

      {selectedAchievement !== null && (
        <AchievementDetailsSheet
          achievement={selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
      {selectedLockerModal === 'stats' && (
        <ProfileStatsModal stats={stats} onClose={() => setSelectedLockerModal(null)} />
      )}
      {selectedLockerModal === 'achievements' && (
        <ProfileAchievementsModal
          achievements={achievements}
          unclaimedCount={unclaimedAchievementsCount}
          onOpenAchievement={setSelectedAchievement}
          onOpenAchievementsPage={() => {
            setSelectedLockerModal(null);
            navigate('/achievements');
          }}
          onClose={() => setSelectedLockerModal(null)}
        />
      )}
      {selectedEquipmentKind !== null && (
        <EquipmentDetailsModal
          kind={selectedEquipmentKind}
          inventory={inventoryQuery.data}
          isSaving={equipmentMut.isPending}
          error={equipmentMut.isError ? equipmentMut.error.message : null}
          onOpenShop={() => {
            equipmentMut.reset();
            setSelectedEquipmentKind(null);
            navigate('/inventory');
          }}
          onClose={() => {
            equipmentMut.reset();
            setSelectedEquipmentKind(null);
          }}
          onSelect={(itemId) => {
            const kind = selectedEquipmentKind;
            equipmentMut.mutate(
              { kind, itemId },
              {
                onSuccess: () => setSelectedEquipmentKind(null),
              },
            );
          }}
        />
      )}
    </main>
  );
}
