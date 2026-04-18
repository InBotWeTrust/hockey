import { useAuthStore } from '../auth/authStore.js';
import { useLogout } from '../auth/useLogout.js';

export function AppHeader(): JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  if (!user) return null;
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid #ddd',
      }}
    >
      <span>{user.displayName}</span>
      <button type="button" onClick={() => void logout()}>
        Выйти
      </button>
    </header>
  );
}
