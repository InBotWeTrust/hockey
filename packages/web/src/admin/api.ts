import { apiFetch } from '../api/apiFetch.js';

export type AdminRole = 'player' | 'admin';
export type GameSettingValue = string | number | boolean;

export interface AdminSummary {
  users: { total: number; admins: number };
  lifetime: { shots: number; goals: number };
  active: { daily: number; training: number };
  last24h: { shots: number; goals: number; mismatches: number };
  gameCoreVersion: number;
}

export interface AdminUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: AdminRole;
  grip: 'left' | 'right';
  level: number;
  xp: number;
  timezone: string;
  createdAt: string;
  lastSeenAt: string | null;
  lifetimeShotsTotal: number;
  lifetimeGoalsTotal: number;
  providers: {
    telegram: { id: string; username: string | null } | null;
    vk: { id: string; username: string | null } | null;
  };
  wallet: {
    shotsCurrent: number;
    shotsMax: number;
    shotsBonus: number;
    pucks: number;
    goldPucks: number;
    wheelSpins: number;
    trainingEnergy: number;
  };
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserDetail {
  user: AdminUser;
  shotModes: Array<{ mode: string; shots: number; goals: number; lastShotAt: string | null }>;
  events: Array<{ id: string; type: string; payload: unknown; createdAt: string }>;
}

export interface AdminGameSetting {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'select';
  defaultValue: GameSettingValue;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
  value: GameSettingValue;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminGameSettingsResponse {
  gameCoreVersion: number;
  settings: AdminGameSetting[];
  balance: {
    goalies: unknown[];
    sticks: unknown[];
    dailyPeriodSpeedPresets: unknown[];
  };
}

export interface AdminUserPatch {
  role?: AdminRole;
  displayName?: string;
  grip?: 'left' | 'right';
  level?: number;
  xp?: number;
  lifetimeShotsTotal?: number;
  lifetimeGoalsTotal?: number;
  wallet?: Partial<AdminUser['wallet']>;
}

export function fetchAdminSummary(): Promise<AdminSummary> {
  return apiFetch<AdminSummary>('/admin/summary');
}

export function fetchAdminUsers(q: string): Promise<AdminUsersResponse> {
  const params = new URLSearchParams({ limit: '20', offset: '0' });
  if (q.trim()) params.set('q', q.trim());
  return apiFetch<AdminUsersResponse>(`/admin/users?${params.toString()}`);
}

export function fetchAdminUser(userId: string): Promise<AdminUserDetail> {
  return apiFetch<AdminUserDetail>(`/admin/users/${userId}`);
}

export function patchAdminUser(userId: string, body: AdminUserPatch): Promise<{ user: AdminUser }> {
  return apiFetch<{ user: AdminUser }>(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchAdminGameSettings(): Promise<AdminGameSettingsResponse> {
  return apiFetch<AdminGameSettingsResponse>('/admin/game-settings');
}

export function patchAdminGameSetting(
  key: string,
  value: GameSettingValue,
): Promise<AdminGameSetting> {
  return apiFetch<AdminGameSetting>(`/admin/game-settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}
