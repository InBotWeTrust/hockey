import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, Info, Settings, Star, TrendingUp, X } from 'lucide-react';
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
  AchievementDetailsSheet,
  EMPTY_PROFILE_STATS,
  formatProfileNumber,
  getLevelLabel,
  ProfileAchievementsSection,
  ProfileStatsGrid,
} from './profileSections.js';
import { artworkForInventoryItem, placeholderArtworkForKind } from './inventoryArtwork.js';

function canStartMouseDragScroll(target: EventTarget | null): boolean {
  return (
    !(target instanceof Element) ||
    target.closest('[data-no-drag-scroll], button, a, input, textarea, select') === null
  );
}

function formatProfileCompactNumber(value: number): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000_000) {
    return `${sign}${formatCompactUnit(absolute / 1_000_000_000_000)}трлн`;
  }
  if (absolute >= 1_000_000_000) {
    return `${sign}${formatCompactUnit(absolute / 1_000_000_000)}млрд`;
  }
  if (absolute >= 1_000_000) {
    return `${sign}${formatCompactUnit(absolute / 1_000_000)}млн`;
  }
  if (absolute >= 10_000) {
    return `${sign}${Math.round(absolute / 1_000)}тыс`;
  }

  return formatProfileNumber(value);
}

function formatCompactUnit(value: number): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded).replace('.', ',').replace(/,0$/, '');
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
  const compactValue = formatProfileCompactNumber(value);
  const visualLength = compactValue.replace(/\s/g, '').length;
  const isLargeValue = Math.abs(value) >= 1_000_000;
  const fontSize = visualLength >= 7 ? 8 : visualLength >= 5 || isLargeValue ? 10 : 11;
  const iconSize = visualLength >= 7 ? 9 : visualLength >= 5 || isLargeValue ? 12 : 14;
  const gap = visualLength >= 5 || isLargeValue ? 2 : 4;
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
        color: rewardColor(tone),
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
        }}
      >
        <span style={{ display: 'inline-flex', transform: `scale(${iconSize / 14})` }}>{icon}</span>
      </span>
      <span>{compactValue}</span>
    </span>
  );
}

function ProfileAvatar({
  avatarUrl,
  initial,
}: {
  avatarUrl?: string | undefined;
  initial: string;
}): JSX.Element {
  return (
    <div
      style={{
        width: 76,
        height: 76,
        gridArea: 'avatar',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          padding: 3,
          background: 'rgba(226, 238, 249, 0.78)',
          boxShadow: '0 9px 22px rgba(15, 23, 42, 0.18)',
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="avatar"
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 999,
              objectFit: 'cover',
              border: '2px solid rgba(239, 247, 255, 0.92)',
              boxSizing: 'border-box',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
              color: '#ffffff',
              fontSize: 25,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(239, 247, 255, 0.92)',
              boxSizing: 'border-box',
            }}
          >
            {initial}
          </div>
        )}
      </div>
    </div>
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

const EQUIPMENT_KINDS: InventoryEquipmentKind[] = ['stick', 'skates', 'nutrition'];

type ProfileInfoSection = 'currency' | 'stats' | 'equipment' | 'achievements';

const PROFILE_SECTION_INFO: Record<ProfileInfoSection, { title: string; copy: string }> = {
  currency: {
    title: 'Валюта',
    copy: 'Монеты нужны для покупок в магазине, звёзды показывают особый прогресс, а опыт отражает общий рост профиля.',
  },
  stats: {
    title: 'Статистика',
    copy: 'Здесь собраны броски, голы, точность и серия игровых дней. Эти числа обновляются по сыгранным режимам.',
  },
  equipment: {
    title: 'Экипировка',
    copy: 'В раздевалке выбирается уже купленный инвентарь: одна клюшка, одна пара коньков и одно питание. В дуэлях расход считается по периодам.',
  },
  achievements: {
    title: 'Выполненные задания',
    copy: 'В профиле показываются только уже полученные задания. Полный каталог и награды находятся в разделе заданий.',
  },
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

function ProfileSectionInfoButton({
  infoSection,
  onOpenInfo,
}: {
  infoSection: ProfileInfoSection;
  onOpenInfo: (section: ProfileInfoSection) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="section-info-btn"
      data-no-drag-scroll="true"
      aria-label={`О разделе: ${PROFILE_SECTION_INFO[infoSection].title}`}
      onClick={() => onOpenInfo(infoSection)}
    >
      <Info size={12} color="var(--muted)" />
    </button>
  );
}

function ProfileSectionLabel({
  children,
  infoSection,
  style,
  onOpenInfo,
}: {
  children: ReactNode;
  infoSection: ProfileInfoSection;
  style?: CSSProperties;
  onOpenInfo: (section: ProfileInfoSection) => void;
}): JSX.Element {
  return (
    <div
      className="section-label"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        ...style,
      }}
    >
      <span style={{ minWidth: 0 }}>{children}</span>
      <ProfileSectionInfoButton infoSection={infoSection} onOpenInfo={onOpenInfo} />
    </div>
  );
}

function isAvailableLockerItem(item: InventoryItem): boolean {
  return item.chargesAvailable + item.chargesReserved > 0;
}

function formatProfileUsageCountLabel(count: number): string {
  const normalized = Math.max(0, Math.trunc(count));
  if (normalized === 0) return 'Нет запаса';

  const mod10 = normalized % 10;
  const mod100 = normalized % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'период'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'периода'
        : 'периодов';
  return `На ${normalized} ${noun}`;
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

function EquipmentSlotButton({
  kind,
  inventory,
  onOpen,
}: {
  kind: InventoryEquipmentKind;
  inventory: InventoryState | undefined;
  onOpen: () => void;
}): JSX.Element {
  const meta = EQUIPMENT_META[kind];
  const items = (inventory?.items[kind] ?? []).filter(isAvailableLockerItem);
  const activeItem = equippedItem(inventory, kind);
  const hasOwnedItems = items.length > 0;
  const hasBaseEquipment = isRequiredEquipment(kind);
  const status = activeItem
    ? formatProfileUsageCountLabel(activeItem.chargesAvailable)
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
  const artworkSrc = activeItem
    ? artworkForInventoryItem(activeItem)
    : placeholderArtworkForKind(kind);
  const hasVisibleEquipment = activeItem !== null || hasBaseEquipment;

  return (
    <button
      type="button"
      data-no-drag-scroll="true"
      onClick={onOpen}
      aria-label={`${meta.title}: ${title}. ${status}`}
      style={{
        minWidth: 0,
        minHeight: 154,
        padding: '13px 11px 11px',
        border: hasVisibleEquipment
          ? '1px solid rgba(15, 23, 42, 0.28)'
          : '1px solid rgba(255,255,255,0.76)',
        borderRadius: 22,
        background: hasVisibleEquipment
          ? 'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.18))'
          : 'rgba(255,255,255,0.18)',
        boxShadow: hasVisibleEquipment
          ? '0 10px 22px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.86)'
          : '0 8px 18px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.74)',
        color: 'var(--ink)',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        gap: 8,
        textAlign: 'left',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            minWidth: 0,
            color: 'var(--muted)',
            fontSize: 10,
            fontWeight: 900,
            lineHeight: 1.05,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {meta.title}
        </span>
      </span>

      <span
        aria-hidden="true"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          justifySelf: 'stretch',
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.74)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72), 0 8px 16px rgba(15,23,42,0.1)',
          background: 'rgba(255,255,255,0.26)',
          opacity: hasVisibleEquipment ? 1 : 0.5,
        }}
      >
        <img
          src={artworkSrc}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
          }}
        />
      </span>

      <span style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0 }}>
        <span
          style={{
            minWidth: 0,
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 950,
            lineHeight: 1.08,
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </span>
        <span
          style={{
            color: hasVisibleEquipment ? 'rgba(15, 23, 42, 0.7)' : 'var(--muted)',
            fontSize: 11,
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          {status}
        </span>
      </span>
    </button>
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
            className="glass"
            aria-pressed={activeId === null}
            style={{
              borderRadius: 18,
              padding: 12,
              color: 'var(--ink)',
              border:
                activeId === null
                  ? '1px solid rgba(15, 23, 42, 0.28)'
                  : '1px solid rgba(255,255,255,0.76)',
              background:
                activeId === null
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.58), rgba(226, 239, 249, 0.24))'
                  : 'rgba(255,255,255,0.22)',
              display: 'block',
              alignItems: 'center',
              textAlign: 'left',
              cursor: isSaving ? 'wait' : 'pointer',
              boxShadow:
                activeId === null
                  ? '0 10px 22px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.86)'
                  : '0 8px 18px rgba(15,23,42,0.1), inset 0 1px 0 rgba(255,255,255,0.74)',
            }}
          >
            <span style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 900 }}>{baseEquipmentTitle(kind)}</span>
              <span
                style={{
                  color: 'rgba(15, 23, 42, 0.62)',
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
                className="glass"
                style={{
                  borderRadius: 24,
                  padding: 14,
                  color: 'var(--ink)',
                  border: selected
                    ? '1px solid rgba(15, 23, 42, 0.28)'
                    : '1px solid rgba(255,255,255,0.76)',
                  background: selected
                    ? 'linear-gradient(180deg, rgba(255,255,255,0.58), rgba(226, 239, 249, 0.24))'
                    : 'rgba(255,255,255,0.22)',
                  display: 'grid',
                  gridTemplateColumns: '96px minmax(0, 1fr)',
                  alignItems: 'start',
                  gap: 12,
                  textAlign: 'left',
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: item.chargesAvailable > 0 ? 1 : 0.55,
                  boxShadow: selected
                    ? '0 12px 24px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.86)'
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
                        color: 'var(--ink)',
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
                      color: 'rgba(15, 23, 42, 0.62)',
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
                      {formatProfileUsageCountLabel(item.chargesAvailable)}
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
                      color: 'rgba(15, 23, 42, 0.66)',
                    }}
                  >
                    <span>Расход: {item.duelPeriodCost}/период</span>
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
                className="btn btn--ghost"
                onClick={onOpenShop}
                style={{
                  width: '100%',
                  minHeight: 46,
                  marginTop: 6,
                  padding: '11px 0',
                  fontSize: 13,
                  fontWeight: 850,
                  letterSpacing: '0.04em',
                  background: 'rgba(255,255,255,0.54)',
                  border: '1px solid rgba(15, 23, 42, 0.13)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 8px 18px rgba(15,23,42,0.08)',
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

function ProfileSectionInfoModal({
  section,
  onClose,
}: {
  section: ProfileInfoSection;
  onClose: () => void;
}): JSX.Element {
  const info = PROFILE_SECTION_INFO[section];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={info.title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 430,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--ink)',
            marginBottom: 10,
          }}
        >
          {info.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{info.copy}</div>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onClose}
          style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

export function ProfileScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const dragScrollRef = useRef<{ startY: number; scrollTop: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);
  const [selectedInfoSection, setSelectedInfoSection] = useState<ProfileInfoSection | null>(null);
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
  const unclaimedAchievementsCount = data?.unclaimedAchievementsCount ?? 0;
  const tokenBalance = inventoryQuery.data?.balances.tokens ?? data?.currencyBalance ?? 0;
  const starBalance = inventoryQuery.data?.balances.stars ?? data?.starBalance ?? 0;
  const experienceBalance =
    inventoryQuery.data?.balances.experience ?? data?.experienceBalance ?? 0;

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
      className="screen"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        height: '100%',
        minHeight: 0,
        paddingBottom: 16,
        overflowY: 'auto',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        className="glass"
        style={{
          margin: 'calc(16px + var(--app-safe-top)) 14px 14px',
          padding: '14px 14px 13px',
          borderRadius: 24,
          display: 'grid',
          gridTemplateColumns: '76px minmax(0, 1fr) 40px',
          gridTemplateAreas: '"avatar info settings"',
          alignItems: 'center',
          gap: 10,
          position: 'relative',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          data-no-drag-scroll="true"
          aria-label="Настройки"
          onClick={() => navigate('/profile/settings')}
          style={{
            width: 40,
            height: 40,
            gridArea: 'settings',
            justifySelf: 'end',
            alignSelf: 'start',
            marginTop: 2,
          }}
        >
          <Settings size={18} />
        </button>
        <ProfileAvatar avatarUrl={data?.avatarUrl ?? undefined} initial={initial} />
        <div
          style={{
            minWidth: 0,
            minHeight: 68,
            gridArea: 'info',
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              minWidth: 0,
              maxWidth: '100%',
              display: 'flex',
              flexWrap: 'nowrap',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 'clamp(6px, 2.8vw, 14px)',
              justifySelf: 'stretch',
              whiteSpace: 'nowrap',
            }}
          >
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
          <span
            style={{
              minWidth: 0,
              maxWidth: '100%',
              alignSelf: 'center',
              color: 'var(--ink)',
              fontSize: 20,
              fontWeight: 850,
              lineHeight: 1.08,
              overflow: 'hidden',
              textAlign: 'left',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data?.displayName ?? '-'}
          </span>
          <div
            style={{
              justifySelf: 'start',
              maxWidth: '100%',
              minWidth: 0,
              height: 16,
              display: 'inline-flex',
              alignItems: 'center',
              color: 'rgba(71, 85, 105, 0.88)',
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Уровень: {getLevelLabel(data?.competitionLevel)}
          </div>
        </div>
      </div>

      <ProfileSectionLabel
        infoSection="stats"
        onOpenInfo={setSelectedInfoSection}
        style={{ marginBottom: 6 }}
      >
        Статистика
      </ProfileSectionLabel>
      <ProfileStatsGrid stats={stats} style={{ margin: '0 14px 14px' }} />

      <ProfileSectionLabel
        infoSection="equipment"
        onOpenInfo={setSelectedInfoSection}
        style={{ marginBottom: 8 }}
      >
        Экипировка
      </ProfileSectionLabel>
      <div
        style={{
          margin: '0 14px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {EQUIPMENT_KINDS.map((kind) => (
          <EquipmentSlotButton
            key={kind}
            kind={kind}
            inventory={inventoryQuery.data}
            onOpen={() => setSelectedEquipmentKind(kind)}
          />
        ))}
      </div>

      <ProfileAchievementsSection
        achievements={achievements}
        labelAccessory={
          <ProfileSectionInfoButton
            infoSection="achievements"
            onOpenInfo={setSelectedInfoSection}
          />
        }
        onOpenAchievement={(achievement) => {
          if (!suppressClickRef.current) setSelectedAchievement(achievement);
        }}
      />
      {unclaimedAchievementsCount > 0 && (
        <button
          type="button"
          className="glass"
          data-no-drag-scroll="true"
          onClick={() => navigate('/achievements')}
          style={{
            margin: '0 14px 14px',
            width: 'calc(100% - 28px)',
            border: '1px solid rgba(255,255,255,0.76)',
            borderRadius: 8,
            padding: '12px 14px',
            textAlign: 'left',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ minWidth: 0, fontSize: 13, fontWeight: 900 }}>Награды ждут получения</span>
          <span className="pill pill--dark" style={{ padding: '5px 10px', fontSize: 11 }}>
            {unclaimedAchievementsCount}
          </span>
        </button>
      )}

      {selectedAchievement !== null && (
        <AchievementDetailsSheet
          achievement={selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
      {selectedInfoSection !== null && (
        <ProfileSectionInfoModal
          section={selectedInfoSection}
          onClose={() => setSelectedInfoSection(null)}
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
