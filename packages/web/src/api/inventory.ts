import { apiFetch } from './apiFetch.js';
import type { DuelInventoryResourceUnit, DuelInventoryTiming } from '@hockey/game-core';

export type InventoryEquipmentKind = 'stick' | 'skates' | 'nutrition';

export interface InventoryItem {
  id: string;
  itemId?: string;
  instanceId?: string | null;
  kind: InventoryEquipmentKind;
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
  timing?: DuelInventoryTiming;
  chargesAvailable: number;
  chargesReserved: number;
}

export interface InventoryPurchase {
  id: string;
  itemId: string | null;
  title: string;
  kind: InventoryEquipmentKind | null;
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
  items: Record<InventoryEquipmentKind, InventoryItem[]>;
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
