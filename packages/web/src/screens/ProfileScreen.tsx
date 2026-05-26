import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coins, Dumbbell, Settings, Sparkles, Trophy, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
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

function canStartMouseDragScroll(target: EventTarget | null): boolean {
  return (
    !(target instanceof Element) ||
    target.closest('[data-no-drag-scroll], button, a, input, textarea, select') === null
  );
}

function ProfileSectionIcon({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        background: 'rgba(15, 23, 42, 0.08)',
        color: 'rgba(15, 23, 42, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
}

const CURRENCY_TONES = {
  tokens: {
    color: 'rgba(138, 90, 10, 0.18)',
    glow: 'radial-gradient(circle at 82% 72%, rgba(176, 124, 22, 0.18), transparent 62%)',
  },
  stars: {
    color: 'rgba(37, 99, 168, 0.18)',
    glow: 'radial-gradient(circle at 82% 72%, rgba(37, 99, 168, 0.16), transparent 62%)',
  },
  experience: {
    color: 'rgba(15, 118, 110, 0.18)',
    glow: 'radial-gradient(circle at 82% 72%, rgba(15, 118, 110, 0.16), transparent 62%)',
  },
} as const;

function CurrencyCard({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: number;
  tone: keyof typeof CURRENCY_TONES;
  children: JSX.Element;
}): JSX.Element {
  const colors = CURRENCY_TONES[tone];

  return (
    <div
      className="glass"
      style={{
        minWidth: 0,
        minHeight: 88,
        padding: '13px 10px',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 8,
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: colors.glow,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: -5,
          bottom: -9,
          color: colors.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          transform: 'rotate(-8deg)',
        }}
      >
        {children}
      </div>
      <div
        style={{
          minWidth: 0,
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          overflowWrap: 'anywhere',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          minWidth: 0,
          color: 'var(--ink)',
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1,
          overflowWrap: 'anywhere',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {formatProfileNumber(value)}
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
  nutrition: { title: 'Энергия', empty: 'Без питания', patchKey: 'nutritionItemId' },
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

function EquipmentDetailsModal({
  kind,
  inventory,
  isSaving,
  error,
  onSelect,
  onClose,
}: {
  kind: InventoryEquipmentKind;
  inventory: InventoryState | undefined;
  isSaving: boolean;
  error: string | null;
  onSelect: (itemId: string | null) => void;
  onClose: () => void;
}): JSX.Element {
  const meta = EQUIPMENT_META[kind];
  const items = inventory?.items[kind] ?? [];
  const activeId = equipmentIdFor(inventory, kind);

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label={meta.title}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(430px, calc(100vw - 28px))', display: 'grid', gap: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">{meta.title}</div>
            <div className="modal-copy">Выберите активный предмет для раздевалки и дуэлей.</div>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <button
            type="button"
            data-no-drag-scroll="true"
            disabled={isSaving}
            onClick={() => onSelect(null)}
            className={activeId === null ? 'glass-dark' : 'glass'}
            style={{
              borderRadius: 18,
              padding: 12,
              color: activeId === null ? '#ffffff' : 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              textAlign: 'left',
              cursor: isSaving ? 'wait' : 'pointer',
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 900 }}>{meta.empty}</span>
            <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.78 }}>Слот пустой</span>
          </button>

          {items.map((item) => {
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                data-no-drag-scroll="true"
                disabled={isSaving || item.chargesAvailable <= 0}
                onClick={() => onSelect(item.id)}
                className={selected ? 'glass-dark' : 'glass'}
                style={{
                  borderRadius: 18,
                  padding: 12,
                  color: selected ? '#ffffff' : 'var(--ink)',
                  display: 'grid',
                  gridTemplateColumns: '48px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: item.chargesAvailable > 0 ? 1 : 0.55,
                }}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }}
                  />
                ) : (
                  <ProfileSectionIcon>
                    <Dumbbell size={20} />
                  </ProfileSectionIcon>
                )}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 900 }}>
                    {item.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      marginTop: 3,
                      fontSize: 12,
                      fontWeight: 800,
                      color: selected ? 'rgba(255,255,255,0.76)' : 'var(--muted)',
                    }}
                  >
                    {item.chargesAvailable} зар. · сила {item.powerScore}
                  </span>
                </span>
                <span
                  className={selected ? 'pill pill--light' : 'pill'}
                  style={{ minWidth: 72, justifyContent: 'center' }}
                >
                  {selected ? 'Активен' : 'Выбрать'}
                </span>
              </button>
            );
          })}

          {items.length === 0 && (
            <div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>
              Предметов этого типа пока нет.
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
  const dragScrollRef = useRef<{ startY: number; scrollTop: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);
  const [selectedEquipmentKind, setSelectedEquipmentKind] =
    useState<InventoryEquipmentKind | null>(null);

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
  const tokenBalance = inventoryQuery.data?.balances.tokens ?? data?.currencyBalance ?? 0;
  const starBalance = inventoryQuery.data?.balances.stars ?? data?.starBalance ?? 0;
  const experienceBalance = inventoryQuery.data?.balances.experience ?? data?.experienceBalance ?? 0;

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
          padding: '14px 14px',
          borderRadius: 24,
          display: 'grid',
          gridTemplateColumns: '64px minmax(0, 1fr) 44px',
          gridTemplateAreas: '"avatar info settings"',
          alignItems: 'center',
          gap: 12,
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
          }}
        >
          <Settings size={18} />
        </button>
        {data?.avatarUrl ? (
          <img
            src={data.avatarUrl}
            alt="avatar"
            style={{
              width: 64,
              height: 64,
              gridArea: 'avatar',
              borderRadius: 999,
              objectFit: 'cover',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.22)',
            }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              gridArea: 'avatar',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
              color: '#ffffff',
              fontSize: 25,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.22)',
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0, gridArea: 'info', display: 'grid', gap: 4 }}>
          <div
            style={{
              minWidth: 0,
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--ink)',
              lineHeight: 1.08,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {data?.displayName ?? '-'}
          </div>
          {(data?.username || data?.tgId) && (
            <div
              style={{
                minWidth: 0,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {data.username ? `@${data.username}` : `id ${data.tgId}`}
            </div>
          )}
          <div
            style={{
              color: 'var(--muted)',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.08em',
              lineHeight: 1.1,
              textTransform: 'uppercase',
            }}
          >
            Уровень: {getLevelLabel(data?.competitionLevel)}
          </div>
        </div>
      </div>

      <div className="section-label" style={{ marginBottom: 6 }}>
        Валюта
      </div>
      <div
        style={{
          margin: '0 14px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <CurrencyCard label="Монеты" value={tokenBalance} tone="tokens">
          <Coins size={58} strokeWidth={2.05} />
        </CurrencyCard>
        <CurrencyCard label="Звёзды" value={starBalance} tone="stars">
          <Sparkles size={58} strokeWidth={2.05} />
        </CurrencyCard>
        <CurrencyCard label="Опыт" value={experienceBalance} tone="experience">
          <Trophy size={58} strokeWidth={2.05} />
        </CurrencyCard>
      </div>

      <div className="section-label" style={{ marginBottom: 6 }}>
        Статистика
      </div>
      <ProfileStatsGrid stats={stats} style={{ margin: '0 14px 14px' }} />

      <div className="section-label" style={{ marginBottom: 8 }}>
        Экипировка
      </div>
      <div
        className="glass"
        style={{
          margin: '0 14px 14px',
          padding: '14px 12px',
          borderRadius: 22,
          minHeight: 121,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 12,
            minHeight: 95,
            overflowX: 'auto',
            overflowY: 'hidden',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x proximity',
          }}
        >
          {(['stick', 'skates', 'nutrition'] as InventoryEquipmentKind[]).flatMap((kind) => {
            const activeId = equipmentIdFor(inventoryQuery.data, kind);
            const items = inventoryQuery.data?.items[kind] ?? [];
            const placeholder = (
              <button
                key={`${kind}:empty`}
                type="button"
                data-no-drag-scroll="true"
                onClick={() => setSelectedEquipmentKind(kind)}
                style={{
                  width: 84,
                  flex: '0 0 84px',
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  textAlign: 'center',
                  cursor: 'pointer',
                  scrollSnapAlign: 'start',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <ProfileSectionIcon>
                  <Dumbbell size={20} />
                </ProfileSectionIcon>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                  {EQUIPMENT_META[kind].title}
                </span>
                <span
                  style={{
                    height: 30,
                    color: 'var(--muted)',
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {EQUIPMENT_META[kind].empty}
                </span>
              </button>
            );

            if (items.length === 0) return [placeholder];

            return items.map((item) => {
              const selected = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-no-drag-scroll="true"
                  disabled={equipmentMut.isPending || item.chargesAvailable <= 0}
                  onClick={() => equipmentMut.mutate({ kind, itemId: item.id })}
                  aria-pressed={selected}
                  style={{
                    width: 92,
                    flex: '0 0 92px',
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    color: 'var(--ink)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'center',
                    cursor: equipmentMut.isPending ? 'wait' : 'pointer',
                    opacity: item.chargesAvailable > 0 ? 1 : 0.5,
                    scrollSnapAlign: 'start',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 18,
                      overflow: 'hidden',
                      position: 'relative',
                      background: 'rgba(15, 23, 42, 0.08)',
                      flexShrink: 0,
                      border: selected
                        ? '2px solid var(--ink)'
                        : '1px solid rgba(255,255,255,0.82)',
                      boxShadow: selected
                        ? '0 8px 18px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.9)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(15,23,42,0.12)',
                    }}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'rgba(15, 23, 42, 0.62)',
                        }}
                      >
                        <Dumbbell size={22} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                    {EQUIPMENT_META[kind].title}
                  </span>
                  <span
                    style={{
                      height: 30,
                      width: '100%',
                      color: selected ? 'var(--ink)' : 'var(--muted)',
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.title}
                  </span>
                </button>
              );
            });
          })}
        </div>
      </div>

      <ProfileAchievementsSection
        achievements={achievements}
        onOpenAchievement={(achievement) => {
          if (!suppressClickRef.current) setSelectedAchievement(achievement);
        }}
      />

      {selectedAchievement !== null && (
        <AchievementDetailsSheet
          achievement={selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
      {selectedEquipmentKind !== null && (
        <EquipmentDetailsModal
          kind={selectedEquipmentKind}
          inventory={inventoryQuery.data}
          isSaving={equipmentMut.isPending}
          error={equipmentMut.isError ? equipmentMut.error.message : null}
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
