export interface ColumnLocation {
  pathname: string;
  search: string;
  hash: string;
}
export interface ColumnKey {
  owner: string;
  venueId: string;
  pageId: string;
}
let owner: string | null = null;
const histories = new Map<string, ColumnLocation[]>();
export const columnKey = (key: ColumnKey) => JSON.stringify([key.owner, key.venueId, key.pageId]);
export function clearColumnHistory() {
  histories.clear();
  owner = null;
}
export function readColumnHistory(key: ColumnKey, initial: ColumnLocation): ColumnLocation[] {
  if (owner !== key.owner) {
    clearColumnHistory();
    owner = key.owner;
  }
  return histories.get(columnKey(key)) ?? [initial];
}
export function writeColumnHistory(key: ColumnKey, history: ColumnLocation[]) {
  histories.set(columnKey(key), history);
}
