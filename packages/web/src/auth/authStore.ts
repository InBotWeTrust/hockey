import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
import { isNativeAndroid } from '../platform/runtime.js';
import { sessionStorage } from './sessionStorage.js';

export interface AuthUser {
  id: string;
  displayName: string;
  role?: 'player' | 'admin';
  experimentalTrainingCourt?: boolean;
  avatarUrl?: string | null;
  grip?: 'left' | 'right';
  competitionLevel?: 'beginner' | 'amateur' | 'professional';
  currencyBalance?: number;
  starBalance?: number;
  displaySource?: 'telegram' | 'vk' | 'custom';
  linkedProviders?: Array<'telegram' | 'vk'>;
  customDisplayName?: string | null;
  customFirstName?: string | null;
  customLastName?: string | null;
  customAvatarUrl?: string | null;
  tgFirstName?: string | null;
  tgLastName?: string | null;
  tgAvatarUrl?: string | null;
  tgUsername?: string | null;
  vkFirstName?: string | null;
  vkLastName?: string | null;
  vkAvatarUrl?: string | null;
  vkUsername?: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface PersistedAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}

const authStorage: PersistStorage<PersistedAuthState> = {
  async getItem() {
    if (!isNativeAndroid()) {
      const raw = localStorage.getItem('hockey.auth');
      return raw === null
        ? null
        : (JSON.parse(raw) as { state: PersistedAuthState; version?: number });
    }
    const session = await sessionStorage.load();
    return session === null ? null : { state: session, version: 0 };
  },
  async setItem(_name, value) {
    if (!isNativeAndroid()) {
      localStorage.setItem('hockey.auth', JSON.stringify(value));
      return;
    }
    const persisted = value as { state: Partial<AuthSession> };
    if (
      typeof persisted.state.accessToken !== 'string' ||
      typeof persisted.state.refreshToken !== 'string' ||
      persisted.state.user === undefined
    ) {
      await sessionStorage.clear().catch(() => undefined);
      return;
    }
    await sessionStorage.save(persisted.state as AuthSession).catch(() => undefined);
  },
  async removeItem() {
    if (isNativeAndroid()) await sessionStorage.clear().catch(() => undefined);
    else localStorage.removeItem('hockey.auth');
  },
};

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (s: AuthSession) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      updateUser: (patch) => set((s) => (s.user ? { user: { ...s.user, ...patch } } : s)),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null }),
      isAuthenticated: () => Boolean(get().accessToken),
    }),
    {
      name: 'hockey.auth',
      storage: authStorage,
      skipHydration: isNativeAndroid(),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    },
  ),
);

export async function initializeAuthSession(): Promise<void> {
  if (isNativeAndroid()) await useAuthStore.persist.rehydrate();
}
