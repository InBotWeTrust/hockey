import { apiFetch } from '../api/apiFetch.js';
import type { ArsenichDestinationKey, ArsenichIntroductionWindow } from '../api/arsenich.js';

export interface AdminArsenichIntroduction {
  destinationKey: ArsenichDestinationKey;
  enabled: boolean;
  revision: number;
  windows: ArsenichIntroductionWindow[];
}
export function fetchAdminArsenichIntroductions(): Promise<{
  introductions: AdminArsenichIntroduction[];
}> {
  return apiFetch('/admin/arsenich/introductions');
}
export function saveAdminArsenichIntroduction(
  destinationKey: ArsenichDestinationKey,
  input: Pick<AdminArsenichIntroduction, 'enabled' | 'windows'>,
): Promise<{ introduction: AdminArsenichIntroduction }> {
  return apiFetch(`/admin/arsenich/introductions/${destinationKey}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
export function resetAdminArsenichIntroduction(
  destinationKey: ArsenichDestinationKey,
  userId: string,
): Promise<{ reset: true }> {
  return apiFetch(`/admin/arsenich/introductions/${destinationKey}/reset`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}
