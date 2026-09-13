import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../auth/authStore.js';
import { AdminAndroidReleaseOnly } from './AdminAndroidReleaseOnly.js';

function setRole(role?: 'player' | 'admin'): void {
  act(() => {
    useAuthStore.getState().setSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 'user-1', displayName: 'Игрок', ...(role === undefined ? {} : { role }) },
    });
  });
}

describe('AdminAndroidReleaseOnly', () => {
  afterEach(() => {
    act(() => useAuthStore.getState().clearSession());
  });

  it('shows Android release controls to an administrator', () => {
    setRole('admin');
    render(
      <AdminAndroidReleaseOnly>
        <div>Android release</div>
      </AdminAndroidReleaseOnly>,
    );
    expect(screen.getByText('Android release')).toBeInTheDocument();
  });

  it.each(['player', undefined] as const)('hides controls for role %s', (role) => {
    setRole(role);
    render(
      <AdminAndroidReleaseOnly>
        <div>Android release</div>
      </AdminAndroidReleaseOnly>,
    );
    expect(screen.queryByText('Android release')).not.toBeInTheDocument();
  });
});
