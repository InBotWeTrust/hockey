import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  displayName: string;
  role?: 'player' | 'admin';
  experimentalTrainingCourt?: boolean;
  avatarUrl?: string | null;
  grip?: 'left' | 'right';
  displaySource?: 'telegram' | 'vk';
  linkedProviders?: Array<'telegram' | 'vk'>;
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
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    },
  ),
);
