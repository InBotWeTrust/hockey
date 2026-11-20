// Version 1 recorded impressions, so it cannot identify a player's acknowledgement.
export const shortcutHintKey = (owner?: string) => `shortcut-hint-ack:${owner ?? 'anonymous'}`;
export const shortcutHintAcknowledged = 'shortcut-hint-acknowledged';
const acknowledged = new Set<string>();

export function hasAcknowledgedShortcutHint(key: string): boolean {
  if (acknowledged.has(key)) return true;
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

export function acknowledgeShortcutHint(key: string): void {
  acknowledged.add(key);
  try { localStorage.setItem(key, '1'); } catch { /* Keep the session acknowledgement. */ }
  window.dispatchEvent(new CustomEvent(shortcutHintAcknowledged, { detail: key }));
}
