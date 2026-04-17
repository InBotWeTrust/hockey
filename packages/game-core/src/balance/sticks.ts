import type { StickEffects } from '../shot/types.js';

export type StickRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Stick {
  id: string;
  name: string;
  rarity: StickRarity;
  effects: StickEffects;
  // Future fields — kept in type so Phase 2 doesn't break API.
  level?: number;
  sockets?: number;
  setId?: string;
}

export const TRAINING_STICK_ID = 'training';

export const STICKS: readonly Stick[] = [
  { id: 'training',     name: 'Тренировочная',          rarity: 'common',    effects: { shotZoneMultiplier: 1.0, rewardMultiplier: 1.0, streakGrowthMultiplier: 1.0 } },
  { id: 'junior',       name: 'Юниорская',              rarity: 'rare',      effects: { shotZoneMultiplier: 1.1, rewardMultiplier: 1.0, streakGrowthMultiplier: 1.0 } },
  { id: 'professional', name: 'Профессиональная',       rarity: 'epic',      effects: { shotZoneMultiplier: 1.2, rewardMultiplier: 1.2, streakGrowthMultiplier: 1.0 } },
  { id: 'sokol',        name: 'Легендарная «Сокол»',    rarity: 'legendary', effects: { shotZoneMultiplier: 1.3, rewardMultiplier: 1.5, streakGrowthMultiplier: 1.5 } },
];

const byId = new Map(STICKS.map((s) => [s.id, s]));

export function getStick(id: string): Stick {
  const s = byId.get(id);
  if (!s) throw new Error(`Unknown stick: ${id}`);
  return s;
}
