import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Settings, Star, TrendingUp, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { fetchHomeArenas, type HomeArena, type HomeArenasResponse } from '../api/arenas.js';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import { HomeArenaModal } from '../components/HomeArenaModal.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
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
import { artworkForInventoryItem, placeholderArtworkForKind } from './inventoryArtwork.js';
import {
  formatInventoryBadgeAmount,
  formatInventoryResourceAmount,
  formatInventoryStockLabel,
} from './inventoryResourceLabels.js';

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
    visualLength >= 12
      ? 6
      : visualLength >= 9
        ? 7
        : visualLength >= 7
          ? 8
          : visualLength >= 5
            ? 10
            : 11;
  const iconSize =
    visualLength >= 12
      ? 7
      : visualLength >= 9
        ? 8
        : visualLength >= 7
          ? 9
          : visualLength >= 5
            ? 12
            : 14;
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

function isAvailableLockerItem(item: InventoryItem): boolean {
  return item.chargesAvailable + item.chargesReserved > 0;
}

function hasOwnedNutrition(inventory: InventoryState | undefined): boolean {
  return (inventory?.items.nutrition ?? []).some(isAvailableLockerItem);
}

function hasOwnedUltimateStick(inventory: InventoryState | undefined): boolean {
  return (inventory?.items.stick ?? []).some(
    (item) => item.chargesAvailable > 0 && /^Ультимейт Ван(?:\s|$)/i.test(item.title.trim()),
  );
}

function profileStickArtworkSrc(inventory: InventoryState | undefined): string {
  return hasOwnedUltimateStick(inventory)
    ? '/inventory/profile-stick-carbon-red.webp'
    : '/inventory/profile-hockey-stick.webp';
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

function formatLockerCount(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.max(0, Math.trunc(value)));
}

function equipmentModalCopy(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') {
    return 'Выберите клюшку, с которой будете начинать матчи. Перед стартом игры выбор можно изменить';
  }
  return 'Выберите купленный предмет для активного слота.';
}

function equipmentStockLineStyle(selected: boolean): CSSProperties {
  return {
    display: 'inline-block',
    marginTop: 3,
    color: selected ? 'rgba(255,255,255,0.92)' : '#334155',
    fontSize: 12,
    fontWeight: 920,
    lineHeight: 1.15,
  };
}

function totalEquipmentResourceAmount(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): number {
  return (inventory?.items[kind] ?? []).reduce(
    (sum, item) => sum + Math.max(0, Math.trunc(item.chargesAvailable)),
    0,
  );
}

function totalEquipmentResourceUnit(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): InventoryItem['resourceUnit'] | undefined {
  return inventory?.items[kind].find((item) => item.resourceUnit)?.resourceUnit;
}

function totalEquipmentBadgeLabel(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): string | undefined {
  const total = totalEquipmentResourceAmount(inventory, kind);
  if (total <= 0) return kind === 'stick' ? formatLockerCount(0) : undefined;
  return formatInventoryBadgeAmount(kind, total, totalEquipmentResourceUnit(inventory, kind));
}

function totalEquipmentStockText(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): string | null {
  const total = totalEquipmentResourceAmount(inventory, kind);
  if (total <= 0) return null;
  return `Всего ${formatInventoryResourceAmount(kind, total, totalEquipmentResourceUnit(inventory, kind))}`;
}

function equipmentPointLabel(value: number): string {
  const normalized = Math.max(0, Math.trunc(value));
  const mod10 = normalized % 10;
  const mod100 = normalized % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'пункт'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'пункта'
        : 'пунктов';
  return `${normalized} ${noun}`;
}

function equipmentEffectLabel(
  kind: InventoryEquipmentKind,
  powerScore: number,
  resourceAmount?: number,
  resourceUnit?: InventoryItem['resourceUnit'],
): string {
  if (kind === 'skates') {
    return resourceAmount !== undefined && resourceAmount > 0
      ? 'Защищают от спотыканий'
      : 'Возможны спотыкания';
  }
  if (kind === 'nutrition') {
    return resourceAmount !== undefined && resourceAmount > 0
      ? `Запас энергии: ${formatInventoryBadgeAmount(kind, resourceAmount, resourceUnit)}`
      : 'Без дополнительной энергии';
  }
  if (powerScore <= 0) {
    return 'Базовая скорость полёта шайбы';
  }
  if (kind === 'stick') return `Ускоряет полёт шайбы на ${equipmentPointLabel(powerScore)}`;
  return 'Базовая скорость полёта шайбы';
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
  const total = totalEquipmentStockText(inventory, kind);
  return `${meta.title}: ${title}. ${status}${total ? `. ${total}` : ''}`;
}

function ProfileLockerIcon({ src }: { src: string }): JSX.Element {
  return <img className="profile-locker-hotspot-icon" src={src} alt="" aria-hidden="true" />;
}

function EquipmentSelectionRadio({ selected }: { selected: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: selected ? '5px solid rgba(255,255,255,0.92)' : '2px solid rgba(15,23,42,0.34)',
        background: selected ? '#1f2a3d' : 'rgba(255,255,255,0.36)',
        boxShadow: selected
          ? '0 0 0 1px rgba(15,23,42,0.2)'
          : 'inset 0 1px 0 rgba(255,255,255,0.62)',
        justifySelf: 'end',
      }}
    />
  );
}

function ProfileLockerHotspotButton({
  className,
  label,
  badge,
  countLabel,
  style,
  onClick,
  children,
}: {
  className: string;
  label: string;
  badge?: number;
  countLabel?: string | undefined;
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
      {countLabel !== undefined && (
        <span className="profile-locker-hotspot__count" aria-hidden="true">
          {countLabel}
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
        <div className="profile-locker-status">
          Уровень: {getLevelLabel(data?.competitionLevel)}
        </div>
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
    <AccessibleModal
      title="Статистика"
      copy="Основные показатели игрока."
      onRequestClose={onClose}
      cardClassName="profile-locker-modal-card"
      backdropStyle={{ zIndex: 420 }}
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
      <ProfileStatsGrid stats={stats} columns={2} style={{ margin: 0 }} />
    </AccessibleModal>
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
    <AccessibleModal
      title={`Достижения (${achievements.length})`}
      ariaLabel="Достижения"
      onRequestClose={onClose}
      cardClassName="profile-locker-modal-card"
      backdropStyle={{ zIndex: 420 }}
      headerAction={
        <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <X size={15} />
        </button>
      }
    >
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
    </AccessibleModal>
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
    <AccessibleModal
      title={meta.title}
      copy={equipmentModalCopy(kind)}
      onRequestClose={onClose}
      closeBlocked={isSaving}
      backdropStyle={{ zIndex: 420 }}
      cardStyle={{
        width: 'min(430px, calc(100vw - 28px))',
        maxHeight: 'calc(100dvh - 112px - var(--app-safe-top) - var(--app-safe-bottom))',
        overflow: 'hidden',
      }}
      headerAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          disabled={isSaving}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      }
    >
      <div style={{ minHeight: 0, display: 'grid', gap: 10 }}>
        <div
          className="no-scrollbar"
          style={{
            minHeight: 0,
            maxHeight: 'min(54dvh, 430px)',
            overflowY: 'auto',
            display: 'grid',
            gap: 8,
            paddingRight: 2,
          }}
        >
          <button
            type="button"
            data-no-drag-scroll="true"
            disabled={isSaving}
            onClick={() => onSelect(null)}
            className={baseSelected ? 'glass-dark' : 'glass'}
            aria-pressed={baseSelected}
            style={{
              minHeight: 74,
              borderRadius: 16,
              padding: 10,
              color: baseSelected ? '#ffffff' : 'var(--ink)',
              border: baseSelected
                ? '1px solid rgba(15, 23, 42, 0.22)'
                : '1px solid rgba(255,255,255,0.76)',
              background: baseSelected ? 'rgba(15, 23, 42, 0.74)' : 'rgba(255,255,255,0.22)',
              display: 'grid',
              gridTemplateColumns: '54px minmax(0, 1fr) 22px',
              alignItems: 'center',
              gap: 10,
              textAlign: 'left',
              cursor: isSaving ? 'wait' : 'pointer',
              boxShadow: baseSelected
                ? '0 14px 26px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.2)'
                : '0 8px 18px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.74)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 54,
                height: 54,
                borderRadius: 14,
                overflow: 'hidden',
                border: baseSelected
                  ? '1px solid rgba(255,255,255,0.32)'
                  : '1px solid rgba(255,255,255,0.78)',
                background: 'rgba(255,255,255,0.28)',
              }}
            >
              <img
                src={placeholderArtworkForKind(kind)}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: 'cover',
                  filter: 'grayscale(0.45)',
                  opacity: 0.72,
                }}
              />
            </span>
            <span style={{ minWidth: 0, display: 'grid', gap: 5 }}>
              <span style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>
                {baseEquipmentTitle(kind)}
              </span>
              <span
                style={{
                  color: baseSelected ? 'rgba(255,255,255,0.72)' : 'rgba(15, 23, 42, 0.62)',
                  fontSize: 12,
                  fontWeight: 760,
                  lineHeight: 1.28,
                }}
              >
                {equipmentEffectLabel(kind, 0)}
              </span>
            </span>
            <EquipmentSelectionRadio selected={baseSelected} />
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
                  minHeight: 94,
                  borderRadius: 18,
                  padding: 10,
                  color: selected ? '#ffffff' : 'var(--ink)',
                  border: selected
                    ? '1px solid rgba(15, 23, 42, 0.22)'
                    : '1px solid rgba(255,255,255,0.76)',
                  background: selected ? 'rgba(15, 23, 42, 0.74)' : 'rgba(255,255,255,0.22)',
                  display: 'grid',
                  gridTemplateColumns: '64px minmax(0, 1fr) 22px',
                  alignItems: 'center',
                  gap: 10,
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
                    width: 64,
                    height: 64,
                    borderRadius: 16,
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
                <span style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                  <span
                    style={{
                      minWidth: 0,
                      color: selected ? '#ffffff' : 'var(--ink)',
                      fontSize: 15,
                      fontWeight: 950,
                      lineHeight: 1.12,
                      overflowWrap: 'break-word',
                    }}
                  >
                    {displayTitle}
                  </span>
                  <span
                    style={{
                      display: 'grid',
                      gap: 2,
                      color: selected ? 'rgba(255,255,255,0.74)' : 'rgba(15, 23, 42, 0.62)',
                      fontSize: 12,
                      fontWeight: 760,
                      lineHeight: 1.25,
                    }}
                  >
                    <span>
                      {equipmentEffectLabel(
                        kind,
                        item.powerScore,
                        item.chargesAvailable,
                        item.resourceUnit,
                      )}
                    </span>
                    <span style={equipmentStockLineStyle(selected)}>
                      {formatInventoryStockLabel(item)}
                    </span>
                    {reservedLabel !== null && <span>{reservedLabel}</span>}
                  </span>
                </span>
                <EquipmentSelectionRadio selected={selected} />
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
      </div>
    </AccessibleModal>
  );
}

export function ProfileScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const lockerSceneRef = useRef<HTMLElement | null>(null);
  const rinkPhotoRef = useRef<HTMLButtonElement | null>(null);
  const restoreArenaFocusRef = useRef(false);
  const dragScrollRef = useRef<{ startY: number; scrollTop: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [lockerHotspotLayerStyle, setLockerHotspotLayerStyle] = useState<CSSProperties>({});
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);
  const [selectedLockerModal, setSelectedLockerModal] = useState<'stats' | 'achievements' | null>(
    null,
  );
  const [selectedEquipmentKind, setSelectedEquipmentKind] = useState<InventoryEquipmentKind | null>(
    null,
  );
  const [arenaModalOpen, setArenaModalOpen] = useState(false);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
    enabled: data !== undefined,
  });
  const homeArenasQuery = useQuery<HomeArenasResponse>({
    queryKey: ['home-arenas'],
    queryFn: fetchHomeArenas,
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

  useEffect(() => {
    if (arenaModalOpen || !restoreArenaFocusRef.current) return;

    restoreArenaFocusRef.current = false;
    const rinkPhoto = rinkPhotoRef.current;
    if (rinkPhoto?.isConnected) rinkPhoto.focus();
  }, [arenaModalOpen]);

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
  const unlockedAchievementsCount = achievements.filter(
    (achievement) => achievement.isUnlocked,
  ).length;
  const stickStockBadge = totalEquipmentBadgeLabel(inventoryQuery.data, 'stick');
  const skatesStockBadge = totalEquipmentBadgeLabel(inventoryQuery.data, 'skates');
  const nutritionStockBadge = totalEquipmentBadgeLabel(inventoryQuery.data, 'nutrition');
  const unclaimedAchievementsCount = data?.unclaimedAchievementsCount ?? 0;
  const tokenBalance = inventoryQuery.data?.balances.tokens ?? data?.currencyBalance ?? 0;
  const starBalance = inventoryQuery.data?.balances.stars ?? data?.starBalance ?? 0;
  const experienceBalance =
    inventoryQuery.data?.balances.experience ?? data?.experienceBalance ?? 0;
  const showNutritionCans = hasOwnedNutrition(inventoryQuery.data);
  const stickArtworkSrc = profileStickArtworkSrc(inventoryQuery.data);
  const jerseyArtworkSrc =
    data?.competitionLevel === 'beginner'
      ? '/inventory/profile-hoodie-training.webp'
      : '/inventory/profile-jersey-hanger.webp';
  const selectedHomeArena = homeArenasQuery.data?.selected_arena;

  function handleArenaSaved(arena: HomeArena): void {
    queryClient.setQueryData<HomeArenasResponse>(['home-arenas'], (current) =>
      current === undefined ? current : { ...current, selected_arena: arena },
    );
  }

  function openArenaModal(event: MouseEvent<HTMLButtonElement>): void {
    rinkPhotoRef.current = event.currentTarget;
    setArenaModalOpen(true);
  }

  function closeArenaModal(): void {
    restoreArenaFocusRef.current = true;
    setArenaModalOpen(false);
  }

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
            src={stickArtworkSrc}
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
          <button
            ref={rinkPhotoRef}
            type="button"
            className="profile-locker-rink-hotspot"
            data-no-drag-scroll="true"
            style={lockerPropStyle(LOCKER_PROPS.rinkPhoto)}
            aria-label="Выбрать домашнюю площадку"
            onClick={openArenaModal}
          >
            {selectedHomeArena !== undefined && (
              <img src={selectedHomeArena.thumbnail_url} alt="" />
            )}
          </button>
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
            countLabel={stickStockBadge}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.stick)}
            onClick={() => setSelectedEquipmentKind('stick')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-stick.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--skates"
            label={equipmentHotspotLabel('skates', inventoryQuery.data)}
            countLabel={skatesStockBadge}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.skates)}
            onClick={() => setSelectedEquipmentKind('skates')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-skates.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--nutrition"
            label={equipmentHotspotLabel('nutrition', inventoryQuery.data)}
            countLabel={nutritionStockBadge}
            style={lockerHotspotStyle(LOCKER_HOTSPOTS.nutrition)}
            onClick={() => setSelectedEquipmentKind('nutrition')}
          >
            <ProfileLockerIcon src="/inventory/profile-icon-nutrition.webp" />
          </ProfileLockerHotspotButton>
          <ProfileLockerHotspotButton
            className="profile-locker-hotspot--achievements"
            label={`Достижения: ${unlockedAchievementsCount} получено`}
            badge={unclaimedAchievementsCount}
            countLabel={formatLockerCount(unlockedAchievementsCount)}
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
      {arenaModalOpen && homeArenasQuery.data !== undefined && (
        <HomeArenaModal
          arenas={homeArenasQuery.data.arenas}
          selectedArena={homeArenasQuery.data.selected_arena}
          onSaved={handleArenaSaved}
          onClose={closeArenaModal}
        />
      )}
    </main>
  );
}
