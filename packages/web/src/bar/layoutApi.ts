import type { BarLayoutSnapshot } from '@hockey/game-core';
import { apiFetch } from '../api/apiFetch.js';
export const fetchBarLayout = () => apiFetch<BarLayoutSnapshot & {novice?:boolean}>('/bar/layout');
export const fetchAdminBarLayout = () => apiFetch<BarLayoutSnapshot>('/admin/bar/layout');
export const saveAdminBarLayout = (snapshot: BarLayoutSnapshot) =>
  apiFetch<BarLayoutSnapshot>('/admin/bar/layout', {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  });
