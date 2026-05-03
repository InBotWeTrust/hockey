import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import {
  fetchAdminGameSettings,
  fetchAdminSummary,
  fetchAdminUser,
  fetchAdminUsers,
  patchAdminGameSetting,
  patchAdminUser,
  type AdminGameSetting,
  type AdminRole,
  type AdminUser,
  type GameSettingValue,
} from './api.js';

type AdminTab = 'overview' | 'users' | 'settings';

const tabs: Array<{ id: AdminTab; label: string; icon: JSX.Element }> = [
  { id: 'overview', label: 'Обзор', icon: <ShieldCheck size={15} /> },
  { id: 'users', label: 'Игроки', icon: <Users size={15} /> },
  { id: 'settings', label: 'Параметры', icon: <SlidersHorizontal size={15} /> },
];

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function roleLabel(role: AdminRole): string {
  return role === 'admin' ? 'Админ' : 'Игрок';
}

function fieldNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function AdminScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const canTryAdmin = user !== null && user.role !== 'player';
  const summary = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: fetchAdminSummary,
    enabled: canTryAdmin,
  });
  const users = useQuery({
    queryKey: ['admin', 'users', debouncedSearch],
    queryFn: () => fetchAdminUsers(debouncedSearch),
    enabled: canTryAdmin,
  });
  const settings = useQuery({
    queryKey: ['admin', 'game-settings'],
    queryFn: fetchAdminGameSettings,
    enabled: canTryAdmin,
  });

  const denied =
    user?.role === 'player' ||
    [summary.error, users.error, settings.error].some(
      (error) => error instanceof ApiError && error.status === 403,
    );

  const selectedUser = users.data?.users.find((item) => item.id === selectedUserId) ?? null;

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  }

  if (denied) {
    return (
      <main className="screen" style={{ padding: 'calc(22px + var(--app-safe-top)) 14px' }}>
        <section className="glass" style={{ borderRadius: 22, padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)' }}>Нет доступа</div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
            Нужна роль admin.
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className="screen no-scrollbar admin-screen"
      style={{
        height: '100dvh',
        minHeight: 0,
        overflowY: 'auto',
        padding: `calc(14px + var(--app-safe-top)) 14px calc(${NAV_HEIGHT + 18}px + var(--app-safe-bottom))`,
        gap: 12,
      }}
    >
      <header className="header-bar glass" style={{ margin: 0 }}>
        <ShieldCheck size={18} />
        <div className="header-bar__title">Админка</div>
        <button
          type="button"
          className="icon-btn"
          onClick={refresh}
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <nav
        className="glass"
        style={{
          borderRadius: 20,
          padding: 5,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 5,
        }}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={tab === item.id ? 'chip chip--active' : 'chip'}
            style={{
              borderRadius: 16,
              padding: '9px 6px',
              display: 'inline-flex',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <OverviewPanel
          loading={summary.isLoading || settings.isLoading}
          summary={summary.data}
          settingsCount={settings.data?.settings.length ?? 0}
        />
      )}
      {tab === 'users' && (
        <UsersPanel
          search={search}
          onSearch={setSearch}
          loading={users.isLoading}
          users={users.data?.users ?? []}
          total={users.data?.total ?? 0}
          selectedUser={selectedUser}
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
        />
      )}
      {tab === 'settings' && (
        <SettingsPanel
          loading={settings.isLoading}
          settings={settings.data?.settings ?? []}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'game-settings'] });
            void queryClient.invalidateQueries({ queryKey: ['admin', 'summary'] });
          }}
        />
      )}
    </main>
  );
}

function OverviewPanel({
  loading,
  summary,
  settingsCount,
}: {
  loading: boolean;
  summary: Awaited<ReturnType<typeof fetchAdminSummary>> | undefined;
  settingsCount: number;
}): JSX.Element {
  const items = [
    { label: 'Игроки', value: summary ? numberText(summary.users.total) : '-' },
    { label: 'Админы', value: summary ? numberText(summary.users.admins) : '-' },
    { label: 'Броски', value: summary ? numberText(summary.lifetime.shots) : '-' },
    { label: 'Голы', value: summary ? numberText(summary.lifetime.goals) : '-' },
    { label: '24ч броски', value: summary ? numberText(summary.last24h.shots) : '-' },
    { label: 'Мисматчи', value: summary ? numberText(summary.last24h.mismatches) : '-' },
  ];
  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Обзор
      </div>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {items.map((item) => (
          <div key={item.label} className="glass" style={{ borderRadius: 18, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)' }}>{item.label}</div>
            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 950, color: 'var(--ink)' }}>
              {loading ? '-' : item.value}
            </div>
          </div>
        ))}
      </section>
      <section className="glass" style={{ borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>Game core</span>
          <span className="pill pill--dark">v{summary?.gameCoreVersion ?? '-'}</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="pill">Активные дни {summary?.active.daily ?? '-'}</span>
          <span className="pill">Тренировки {summary?.active.training ?? '-'}</span>
          <span className="pill">Параметры {settingsCount || '-'}</span>
        </div>
      </section>
    </>
  );
}

function UsersPanel({
  search,
  onSearch,
  loading,
  users,
  total,
  selectedUser,
  selectedUserId,
  onSelectUser,
}: {
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  users: AdminUser[];
  total: number;
  selectedUser: AdminUser | null;
  selectedUserId: string | null;
  onSelectUser: (value: string) => void;
}): JSX.Element {
  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Игроки
      </div>
      <label
        className="glass"
        style={{
          borderRadius: 18,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={16} color="var(--muted)" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Имя, username или tg id"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            fontWeight: 700,
          }}
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="pill">Найдено {loading ? '-' : total}</span>
      </div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => onSelectUser(user.id)}
            className="glass"
            style={{
              borderRadius: 18,
              padding: 12,
              border:
                selectedUserId === user.id
                  ? '1px solid rgba(15, 23, 42, 0.72)'
                  : '1px solid var(--glass-border)',
              display: 'grid',
              gridTemplateColumns: '42px minmax(0, 1fr) 22px',
              gap: 10,
              alignItems: 'center',
              textAlign: 'left',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <UserAvatar user={user} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: 'var(--ink)',
                  fontSize: 14,
                  fontWeight: 900,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.displayName}
              </div>
              <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>
                {roleLabel(user.role)} · TG {user.providers.telegram?.id ?? '-'}
              </div>
            </div>
            <ChevronRight size={18} color="var(--muted)" />
          </button>
        ))}
        {!loading && users.length === 0 && (
          <div className="glass" style={{ borderRadius: 18, padding: 16, color: 'var(--muted)' }}>
            Ничего не найдено
          </div>
        )}
      </section>
      {selectedUser !== null && <UserEditor userId={selectedUser.id} fallback={selectedUser} />}
    </>
  );
}

function UserAvatar({ user }: { user: AdminUser }): JSX.Element {
  const initial = user.displayName.charAt(0).toUpperCase() || '?';
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        style={{ width: 42, height: 42, borderRadius: 999, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 999,
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {initial}
    </div>
  );
}

function UserEditor({ userId, fallback }: { userId: string; fallback: AdminUser }): JSX.Element {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchAdminUser(userId),
  });
  const user = detail.data?.user ?? fallback;
  const [role, setRole] = useState<AdminRole>(user.role);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [pucks, setPucks] = useState(fieldNumber(user.wallet.pucks));
  const [goldPucks, setGoldPucks] = useState(fieldNumber(user.wallet.goldPucks));
  const [shotsCurrent, setShotsCurrent] = useState(fieldNumber(user.wallet.shotsCurrent));

  useEffect(() => {
    setRole(user.role);
    setDisplayName(user.displayName);
    setPucks(fieldNumber(user.wallet.pucks));
    setGoldPucks(fieldNumber(user.wallet.goldPucks));
    setShotsCurrent(fieldNumber(user.wallet.shotsCurrent));
  }, [user]);

  const mutation = useMutation({
    mutationFn: () =>
      patchAdminUser(user.id, {
        role,
        displayName,
        wallet: {
          pucks: Number(pucks),
          goldPucks: Number(goldPucks),
          shotsCurrent: Number(shotsCurrent),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'summary'] });
    },
  });

  return (
    <section className="glass" style={{ borderRadius: 20, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <UserAvatar user={user} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 950, color: 'var(--ink)' }}>
            {user.displayName}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>
            {user.timezone} · {numberText(user.lifetimeGoalsTotal)} голов
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <AdminField label="Имя">
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </AdminField>
        <AdminField label="Роль">
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            <option value="player">player</option>
            <option value="admin">admin</option>
          </select>
        </AdminField>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <AdminField label="Шайбы">
            <input value={pucks} onChange={(event) => setPucks(event.target.value)} />
          </AdminField>
          <AdminField label="Золото">
            <input value={goldPucks} onChange={(event) => setGoldPucks(event.target.value)} />
          </AdminField>
          <AdminField label="Броски">
            <input value={shotsCurrent} onChange={(event) => setShotsCurrent(event.target.value)} />
          </AdminField>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--cta"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        style={{ marginTop: 12, width: '100%', padding: '12px 0', fontSize: 13 }}
      >
        <Save size={16} />
        Сохранить
      </button>
      {mutation.isError && (
        <div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>
          {mutation.error instanceof Error ? mutation.error.message : 'Ошибка сохранения'}
        </div>
      )}
      {detail.data?.shotModes.length ? (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {detail.data.shotModes.map((mode) => (
            <span key={mode.mode} className="pill">
              {mode.mode} {mode.shots}/{mode.goals}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SettingsPanel({
  loading,
  settings,
  onSaved,
}: {
  loading: boolean;
  settings: AdminGameSetting[];
  onSaved: () => void;
}): JSX.Element {
  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Параметры
      </div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {settings.map((setting) => (
          <SettingEditor key={setting.key} setting={setting} onSaved={onSaved} />
        ))}
        {loading && (
          <div className="glass" style={{ borderRadius: 18, padding: 16, color: 'var(--muted)' }}>
            Загрузка...
          </div>
        )}
      </section>
    </>
  );
}

function SettingEditor({
  setting,
  onSaved,
}: {
  setting: AdminGameSetting;
  onSaved: () => void;
}): JSX.Element {
  const [value, setValue] = useState(String(setting.value));
  useEffect(() => setValue(String(setting.value)), [setting.value]);
  const parsedValue = useMemo<GameSettingValue>(() => {
    if (setting.type === 'number') return Number(value);
    return value;
  }, [setting.type, value]);

  const mutation = useMutation({
    mutationFn: () => patchAdminGameSetting(setting.key, parsedValue),
    onSuccess: onSaved,
  });

  return (
    <div className="glass" style={{ borderRadius: 20, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: 'var(--ink)' }}>{setting.label}</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>
            {setting.key}
          </div>
        </div>
        <span className="pill">default {String(setting.defaultValue)}</span>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8 }}>
        {setting.type === 'select' ? (
          <select value={value} onChange={(event) => setValue(event.target.value)}>
            {setting.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={value}
            inputMode="numeric"
            onChange={(event) => setValue(event.target.value)}
            min={setting.min}
            max={setting.max}
          />
        )}
        <button
          type="button"
          className="icon-btn icon-btn--dark"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          title="Сохранить"
          aria-label={`Сохранить ${setting.label}`}
          style={{ width: 44, height: 44 }}
        >
          <Save size={17} />
        </button>
      </div>
      {mutation.isError && (
        <div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>
          {mutation.error instanceof Error ? mutation.error.message : 'Ошибка сохранения'}
        </div>
      )}
    </div>
  );
}

function AdminField({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>
      {children}
    </label>
  );
}
