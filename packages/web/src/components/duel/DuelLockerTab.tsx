import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Info, X } from 'lucide-react';
import {
  fetchMyInventory,
  patchEquipment,
  type InventoryEquipmentKind,
  type InventoryItem,
  type InventoryState,
} from '../../api/inventory.js';
import { artworkForInventoryItem, placeholderArtworkForKind } from '../../screens/inventoryArtwork.js';
import {
  formatInventoryBadgeAmount,
  formatInventoryStockLabel,
  formatRecoveryMinutesTotal,
  recoveryMinutesAvailable,
} from '../../screens/inventoryResourceLabels.js';

const DUEL_INVENTORY_SLOTS = [
  { kind: 'skates', label: 'Коньки' },
  { kind: 'stick', label: 'Клюшка' },
  { kind: 'nutrition', label: 'Энергия' },
] as const;

const DUEL_EQUIPMENT_META: Record<
  InventoryEquipmentKind,
  { title: string; empty: string; patchKey: 'stickItemId' | 'skatesItemId' | 'nutritionItemId' }
> = {
  stick: { title: 'Клюшка', empty: 'Без клюшки', patchKey: 'stickItemId' },
  skates: { title: 'Коньки', empty: 'Без коньков', patchKey: 'skatesItemId' },
  nutrition: { title: 'Питание', empty: 'Без питания', patchKey: 'nutritionItemId' },
};

function duelEquipmentIdFor(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): string | null {
  if (!inventory?.equipped) return null;
  if (kind === 'stick') return inventory.equipped.stickItemId;
  if (kind === 'skates') return inventory.equipped.skatesItemId;
  return inventory.equipped.nutritionItemId;
}

function duelEquippedItem(
  inventory: InventoryState | undefined,
  kind: InventoryEquipmentKind,
): InventoryItem | null {
  const id = duelEquipmentIdFor(inventory, kind);
  return inventory?.items[kind].find((item) => item.id === id) ?? null;
}

function isDuelLockerItemAvailable(item: InventoryItem): boolean {
  return item.chargesAvailable + item.chargesReserved > 0;
}

function duelBaseEquipmentTitle(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') return 'Обычная клюшка';
  if (kind === 'skates') return 'Обычные коньки';
  return 'Без питания';
}

function duelEquipmentEmptyPurchaseLabel(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') return 'Купленных клюшек пока нет';
  if (kind === 'skates') return 'Купленных коньков пока нет';
  return 'Купленного питания пока нет';
}

function duelEquipmentModalCopy(kind: InventoryEquipmentKind): string {
  if (kind === 'stick') {
    return 'Выберите клюшку, с которой будете начинать матчи. Перед стартом игры выбор можно изменить';
  }
  return 'Выберите предмет для этого слота.';
}

function duelEquipmentStockLineStyle(): CSSProperties {
  return {
    display: 'inline-block',
    marginTop: 3,
    color: '#334155',
    fontSize: 12,
    fontWeight: 920,
    lineHeight: 1.15,
  };
}

function duelEquipmentPointLabel(value: number): string {
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

function duelEquipmentEffectLabel(
  kind: InventoryEquipmentKind,
  powerScore: number | undefined,
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
  const score = Math.max(0, Math.trunc(powerScore ?? 0));
  if (score <= 0) return 'Базовая скорость полёта шайбы';
  return `Ускоряет полёт шайбы на ${duelEquipmentPointLabel(score)}`;
}

function duelEquipmentDisplayTitle(item: Pick<InventoryItem, 'kind' | 'rarity' | 'title'>): string {
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

export function DuelLockerTab({
  onInfo,
  onOpenInventory,
}: {
  onInfo: () => void;
  onOpenInventory: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedKind, setSelectedKind] = useState<InventoryEquipmentKind | null>(null);
  const inventoryQuery = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });
  const equipmentMut = useMutation<
    InventoryState,
    Error,
    { kind: InventoryEquipmentKind; itemId: string | null }
  >({
    mutationFn: ({ kind, itemId }) =>
      patchEquipment({ [DUEL_EQUIPMENT_META[kind].patchKey]: itemId }),
    onSuccess: (inventory) => {
      queryClient.setQueryData(['inventory', 'me'], inventory);
    },
  });
  const recoveryItems = inventoryQuery.data?.items.recovery ?? [];
  const recoveryMinutes = recoveryMinutesAvailable(recoveryItems);
  const recoveryArtwork =
    recoveryItems.find((item) => item.chargesAvailable > 0)?.imageUrl ??
    '/inventory/recovery-30.webp';

  return (
    <>
      <section className="duel-section">
        <div className="duel-locker-kind-list">
          {DUEL_INVENTORY_SLOTS.map((slot) => (
            <section className="duel-locker-kind-section" key={slot.kind}>
              <div
                className={`section-label duel-section-title duel-locker-kind-section__title${
                  slot.kind === 'skates' ? ' duel-section-title--with-action' : ''
                }`}
              >
                {DUEL_EQUIPMENT_META[slot.kind].title}
                {slot.kind === 'skates' && (
                  <button
                    type="button"
                    className="section-info-btn duel-section-info-btn"
                    onClick={onInfo}
                    aria-label="Что такое раздевалка"
                  >
                    <Info size={12} color="rgba(240, 248, 255, 0.92)" />
                  </button>
                )}
              </div>
              <DuelLockerSlotButton
                kind={slot.kind}
                inventory={inventoryQuery.data}
                onOpen={() => setSelectedKind(slot.kind)}
              />
            </section>
          ))}
          <section className="duel-locker-kind-section" aria-label="Восстановление">
            <div className="section-label duel-section-title duel-locker-kind-section__title">
              Восстановление
            </div>
            <button
              type="button"
              className="glass duel-locker-slot"
              onClick={onOpenInventory}
              aria-label={`Восстановление: ${formatRecoveryMinutesTotal(recoveryMinutes)}`}
            >
              <span className="duel-locker-slot__artwork" aria-hidden="true">
                <img
                  src={recoveryArtwork}
                  alt=""
                  style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                />
              </span>
              <span className="duel-locker-slot__copy amateur-hub-card__copy">
                <strong className="duel-locker-slot__title">Наборы для восстановления</strong>
                <span className="duel-locker-slot__status">
                  {recoveryMinutes > 0
                    ? `В запасе: ${formatRecoveryMinutesTotal(recoveryMinutes)}`
                    : 'Нет в запасе'}
                </span>
              </span>
              <ChevronRight
                className="card-chevron"
                size={19}
                strokeWidth={2.7}
                aria-hidden="true"
              />
            </button>
          </section>
        </div>
      </section>
      <button type="button" className="btn btn--cta" onClick={onOpenInventory}>
        В магазин
      </button>
      {selectedKind !== null && (
        <DuelEquipmentDetailsModal
          kind={selectedKind}
          inventory={inventoryQuery.data}
          isSaving={equipmentMut.isPending}
          error={equipmentMut.isError ? equipmentMut.error.message : null}
          onOpenShop={() => {
            equipmentMut.reset();
            setSelectedKind(null);
            onOpenInventory();
          }}
          onClose={() => {
            equipmentMut.reset();
            setSelectedKind(null);
          }}
          onSelect={(itemId) => {
            const kind = selectedKind;
            equipmentMut.mutate(
              { kind, itemId },
              {
                onSuccess: () => setSelectedKind(null),
              },
            );
          }}
        />
      )}
    </>
  );
}

function DuelLockerSlotButton({
  kind,
  inventory,
  onOpen,
}: {
  kind: InventoryEquipmentKind;
  inventory: InventoryState | undefined;
  onOpen: () => void;
}): JSX.Element {
  const meta = DUEL_EQUIPMENT_META[kind];
  const activeItem = duelEquippedItem(inventory, kind);
  const title = activeItem ? duelEquipmentDisplayTitle(activeItem) : duelBaseEquipmentTitle(kind);
  const status = activeItem ? formatInventoryStockLabel(activeItem) : 'Базовый вариант';
  const artwork = activeItem
    ? artworkForInventoryItem(activeItem)
    : placeholderArtworkForKind(kind);

  return (
    <button
      type="button"
      className="glass duel-locker-slot"
      onClick={onOpen}
      aria-label={`${meta.title}: ${title}. ${status}`}
    >
      <span className="duel-locker-slot__artwork" aria-hidden="true">
        <img
          src={artwork}
          alt=""
          onError={(event) => {
            const fallback = placeholderArtworkForKind(kind);
            if (event.currentTarget.getAttribute('src') !== fallback) {
              event.currentTarget.setAttribute('src', fallback);
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
            filter: 'none',
            opacity: 1,
          }}
        />
      </span>
      <span className="duel-locker-slot__copy amateur-hub-card__copy">
        <strong className="duel-locker-slot__title">{title}</strong>
        <span className="duel-locker-slot__status">{status}</span>
      </span>
      <ChevronRight className="card-chevron" size={19} strokeWidth={2.7} aria-hidden="true" />
    </button>
  );
}

export function DuelEquipmentSelectionRadio({
  selected,
}: {
  selected: boolean;
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`duel-equipment-option__check${selected ? ' duel-equipment-option__check--selected' : ''}`}
    >
      {selected ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  );
}

function DuelEquipmentDetailsModal({
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
  const meta = DUEL_EQUIPMENT_META[kind];
  const items = (inventory?.items[kind] ?? []).filter(isDuelLockerItemAvailable);
  const activeId = duelEquipmentIdFor(inventory, kind);
  const showBaseEquipment = true;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 420 }}>
      <section
        role="dialog"
        aria-label={meta.title}
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(430px, calc(100vw - 28px))',
          maxHeight: 'calc(100dvh - 112px - var(--app-safe-top) - var(--app-safe-bottom))',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          gap: 10,
          position: 'relative',
          overflow: 'hidden',
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
          <div className="modal-copy">{duelEquipmentModalCopy(kind)}</div>
        </div>

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
          {showBaseEquipment && (
            <button
              type="button"
              data-no-drag-scroll="true"
              disabled={isSaving}
              onClick={() => onSelect(null)}
              className={`glass duel-equipment-option${activeId === null ? ' duel-equipment-option--selected' : ''}`}
              aria-pressed={activeId === null}
              style={{
                minHeight: 78,
                borderRadius: 16,
                padding: 10,
                display: 'grid',
                gridTemplateColumns: '56px minmax(0, 1fr) 22px',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                cursor: isSaving ? 'wait' : 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.78)',
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
                  {duelBaseEquipmentTitle(kind)}
                </span>
                <span
                  style={{
                    color: 'rgba(15, 23, 42, 0.62)',
                    fontSize: 12,
                    fontWeight: 760,
                    lineHeight: 1.28,
                  }}
                >
                  {duelEquipmentEffectLabel(kind, 0)}
                </span>
              </span>
              <DuelEquipmentSelectionRadio selected={activeId === null} />
            </button>
          )}

          {items.map((item) => {
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                data-no-drag-scroll="true"
                disabled={isSaving || item.chargesAvailable <= 0}
                onClick={() => onSelect(item.id)}
                aria-pressed={selected}
                className={`glass duel-equipment-option${selected ? ' duel-equipment-option--selected' : ''}`}
                style={{
                  minHeight: 78,
                  borderRadius: 16,
                  padding: 10,
                  display: 'grid',
                  gridTemplateColumns: '56px minmax(0, 1fr) 22px',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  cursor: isSaving ? 'wait' : 'pointer',
                  opacity: item.chargesAvailable > 0 ? 1 : 0.55,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
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
                      color: 'var(--ink)',
                      fontSize: 15,
                      fontWeight: 950,
                      lineHeight: 1.12,
                      overflowWrap: 'break-word',
                    }}
                  >
                    {duelEquipmentDisplayTitle(item)}
                  </span>
                  <span
                    style={{
                      display: 'grid',
                      gap: 2,
                      color: 'rgba(15, 23, 42, 0.62)',
                      fontSize: 12,
                      fontWeight: 760,
                      lineHeight: 1.25,
                    }}
                  >
                    <span>
                      {duelEquipmentEffectLabel(
                        kind,
                        item.powerScore,
                        item.chargesAvailable,
                        item.resourceUnit,
                      )}
                    </span>
                    <span style={duelEquipmentStockLineStyle()}>
                      {formatInventoryStockLabel(item)}
                    </span>
                  </span>
                </span>
                <DuelEquipmentSelectionRadio selected={selected} />
              </button>
            );
          })}

          {items.length === 0 && (
            <div className="duel-equipment-empty">
              <div className="duel-equipment-empty__message">
                {duelEquipmentEmptyPurchaseLabel(kind)}
              </div>
            </div>
          )}
        </div>

        {items.length === 0 && (
          <button
            type="button"
            className="btn btn--cta duel-equipment-empty__action"
            onClick={onOpenShop}
          >
            В магазин
          </button>
        )}

        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

