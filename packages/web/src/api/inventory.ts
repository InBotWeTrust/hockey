import { apiFetch } from './apiFetch.js';
import type { DuelInventoryResourceUnit, DuelInventoryTiming } from '@hockey/game-core';
import type { GameplayLockDTO } from './gameplayLock.js';

export type InventoryEquipmentKind = 'stick' | 'skates' | 'nutrition';
export type InventoryKind = InventoryEquipmentKind | 'recovery';

export interface InventoryItem {
  id: string;
  itemId?: string;
  instanceId?: string | null;
  kind: InventoryKind;
  title: string;
  description: string;
  imageUrl: string | null;
  currencyPrice: number;
  chargesPerPurchase: number;
  lowStockThreshold?: number;
  resourceUnit?: DuelInventoryResourceUnit;
  resourceLabel?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  effectPuckSpeedPoints?: number;
  effectRecoveryMinutes?: number;
  timing?: DuelInventoryTiming;
  chargesAvailable: number;
  chargesReserved: number;
}

export interface InventoryPurchase {
  id: string;
  itemId: string | null;
  title: string;
  kind: InventoryKind | null;
  tokensSpent: number;
  chargesAdded: number;
  createdAt: string;
}

export interface BankPurchase {
  id: string;
  title: string;
  amountRub: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled';
  createdAt: string;
  paidAt: string | null;
}

export type InventoryTransactionCurrency = 'coin' | 'star' | 'experience' | 'ruble';

export interface InventoryTransactionAmount {
  currency: InventoryTransactionCurrency;
  value: number;
}

export interface InventoryTransaction {
  id: string;
  title: string;
  subtitle: string;
  category: 'inventory' | 'bank' | 'reward' | 'duel' | 'adjustment' | 'other';
  flow: 'credit' | 'debit' | 'neutral';
  amounts: InventoryTransactionAmount[];
  createdAt: string;
}

export type InventoryTransactionFilter = 'all' | 'credit' | 'debit' | 'ruble';

export interface InventoryTransactionPage {
  transactions: InventoryTransaction[];
  nextCursor: string | null;
}

export interface InventoryState {
  balances: {
    tokens: number;
    stars: number;
    experience?: number;
  };
  equipped: {
    stickItemId: string | null;
    skatesItemId: string | null;
    nutritionItemId: string | null;
  };
  items: Record<InventoryKind, InventoryItem[]>;
  purchaseHistory?: InventoryPurchase[];
  bankHistory?: BankPurchase[];
  transactionHistory?: InventoryTransaction[];
}

export interface EquipmentPatch {
  stickItemId?: string | null;
  skatesItemId?: string | null;
  nutritionItemId?: string | null;
}

export function fetchMyInventory(): Promise<InventoryState> {
  return apiFetch<InventoryState>('/inventory/me');
}

export function fetchInventoryTransactions(
  filter: InventoryTransactionFilter,
  cursor: string | null = null,
  limit = 20,
): Promise<InventoryTransactionPage> {
  const query = new URLSearchParams({ filter, limit: String(limit) });
  if (cursor !== null) query.set('cursor', cursor);
  return apiFetch<InventoryTransactionPage>(`/inventory/transactions?${query.toString()}`);
}

export function patchEquipment(patch: EquipmentPatch): Promise<InventoryState> {
  return apiFetch<InventoryState>('/inventory/equipment', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function purchaseInventoryItem(itemId: string): Promise<InventoryState> {
  return apiFetch<InventoryState>(`/inventory/items/${itemId}/purchase`, {
    method: 'POST',
  });
}

export interface UseRecoveryKitInput {
  itemId: string;
  action: 'start_daily_period' | 'start_classic';
  buyIfNeeded: boolean;
  idempotencyKey: string;
}

export interface UseRecoveryKitResponse {
  inventory: InventoryState;
  gameplayLock: GameplayLockDTO | null;
  appliedMinutes: number;
}

export function useRecoveryKit(input: UseRecoveryKitInput): Promise<UseRecoveryKitResponse> {
  return apiFetch<UseRecoveryKitResponse>('/inventory/recovery/use', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
