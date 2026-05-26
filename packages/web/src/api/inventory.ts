import { apiFetch } from './apiFetch.js';

export type InventoryEquipmentKind = 'stick' | 'skates' | 'nutrition';

export interface InventoryItem {
  id: string;
  kind: InventoryEquipmentKind;
  title: string;
  description: string;
  imageUrl: string | null;
  currencyPrice: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  powerScore: number;
  duelPeriodCost: number;
  chargesAvailable: number;
  chargesReserved: number;
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
