export type EquipmentKind = 'stick' | 'skates' | 'nutrition';

export type EquipmentSelection = Record<EquipmentKind, string | null>;

export type EquipmentSelectionChange = Partial<Record<EquipmentKind, string | null | undefined>>;

const KINDS: readonly EquipmentKind[] = ['stick', 'skates', 'nutrition'];

export function mergeEquipmentSelection(
  current: EquipmentSelection,
  previousProfile: EquipmentSelection | null,
  profile: EquipmentSelection,
  changedInGame: EquipmentSelectionChange,
): EquipmentSelection {
  const next = { ...current };
  for (const kind of KINDS) {
    if (previousProfile !== null && previousProfile[kind] !== profile[kind]) {
      next[kind] = profile[kind];
    }
    if (changedInGame[kind] !== undefined) next[kind] = changedInGame[kind];
  }
  return next;
}

export function equipmentSelectionChanged(
  left: EquipmentSelection,
  right: EquipmentSelection,
): boolean {
  return KINDS.some((kind) => left[kind] !== right[kind]);
}
