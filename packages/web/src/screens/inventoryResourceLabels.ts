import type { InventoryEquipmentKind, InventoryItem } from '../api/inventory.js';

type InventoryResourceUnit = NonNullable<InventoryItem['resourceUnit']>;
type DisplayResourceUnit = Exclude<InventoryResourceUnit, 'period'> | 'charge';

const RESOURCE_UNIT_BY_KIND: Record<
  InventoryEquipmentKind,
  Exclude<InventoryResourceUnit, 'period'>
> = {
  stick: 'shot',
  skates: 'distance',
  nutrition: 'energy_ms',
};

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const normalized = Math.abs(Math.trunc(value));
  const mod100 = normalized % 100;
  const mod10 = normalized % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function effectiveResourceUnit(
  kind: InventoryEquipmentKind | null | undefined,
  unit: InventoryItem['resourceUnit'] | undefined,
): DisplayResourceUnit {
  if (unit && unit !== 'period') return unit;
  if (!kind) return 'charge';
  return RESOURCE_UNIT_BY_KIND[kind];
}

export function formatInventoryResourceAmount(
  kind: InventoryEquipmentKind | null | undefined,
  amount: number,
  unit?: InventoryItem['resourceUnit'],
): string {
  const normalized = Math.max(0, Math.trunc(amount));
  const resourceUnit = effectiveResourceUnit(kind, unit);

  if (resourceUnit === 'shot') {
    return `${numberText(normalized)} ${pluralRu(normalized, 'бросок', 'броска', 'бросков')}`;
  }

  if (resourceUnit === 'distance') {
    return `${numberText(normalized)} ${pluralRu(normalized, 'прокат', 'проката', 'прокатов')}`;
  }

  if (resourceUnit === 'charge') {
    return `${numberText(normalized)} ${pluralRu(normalized, 'заряд', 'заряда', 'зарядов')}`;
  }

  const minutes = normalized > 0 ? Math.ceil(normalized / 60_000) : 0;
  return `${numberText(minutes)} ${pluralRu(minutes, 'минута', 'минуты', 'минут')} энергии`;
}

export function formatInventoryStockLabel(item: InventoryItem): string {
  if (item.chargesAvailable <= 0) return 'Нет запаса';
  return `Осталось ${formatInventoryResourceAmount(item.kind, item.chargesAvailable, item.resourceUnit)}`;
}
