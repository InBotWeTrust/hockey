import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  BarChart3,
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Gamepad2,
  Heart,
  Megaphone,
  Medal,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import { ChannelPostEditorSheet } from '../chat/components/ChannelPostEditorSheet.js';
import { RichText } from '../chat/richText.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';
import { GlassSelect, type GlassSelectOption } from '../components/GlassSelect.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { AchievementDetailsSheet, AchievementTile } from '../screens/profileSections.js';
import {
  createAdminInventoryItem,
  deleteAdminChannelPost,
  deleteAdminInventoryItem,
  fetchAdminChannelNews,
  fetchAdminFeedback,
  fetchAdminGameSettings,
  fetchAdminInventory,
  fetchAdminPayments,
  fetchAdminSummary,
  fetchAdminUser,
  fetchAdminUsers,
  patchAdminChannelPost,
  patchAdminFeedback,
  patchAdminInventoryItem,
  patchAdminGameSetting,
  patchAdminUser,
  type AdminDashboard,
  type AdminDashboardSeriesPoint,
  type AdminChannelPeriod,
  type AdminChannelPost,
  type AdminChannelResponse,
  type AdminFeedback,
  type AdminFeedbackKind,
  type AdminFeedbackQuery,
  type AdminGameSetting,
  type AdminInventoryItem,
  type AdminInventoryItemPatch,
  type AdminNotificationStats,
  type AdminUserDetail,
  type AdminLevelFilter,
  type AdminPayment,
  type AdminPaymentSort,
  type AdminPaymentStatus,
  type AdminRole,
  type AdminSort,
  type AdminUser,
  type AdminUserPatch,
  type GameSettingValue,
} from './api.js';

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'channel'
  | 'payments'
  | 'inventory'
  | 'feedback'
  | 'settings';
type SortField = 'name' | 'goals' | 'accuracy';
type SortDirection = 'asc' | 'desc';
type AdminIdentity = AdminUser['identities'][number];
type AdminAchievement = AdminUserDetail['achievements'][number];
type SettingsSectionId = 'daily' | 'training' | 'amateur' | 'pro';
type AdminFeedbackStatus = AdminFeedbackQuery['status'];

const tabs: Array<{ id: AdminTab; label: string; icon: JSX.Element }> = [
  { id: 'dashboard', label: 'Дашборд', icon: <BarChart3 size={15} /> },
  { id: 'users', label: 'Игроки', icon: <Users size={15} /> },
  { id: 'channel', label: 'Канал', icon: <Megaphone size={15} /> },
  { id: 'payments', label: 'Платежи', icon: <CreditCard size={15} /> },
  { id: 'inventory', label: 'Инвентарь', icon: <Package size={15} /> },
  { id: 'feedback', label: 'Отзывы', icon: <MessageSquare size={15} /> },
  { id: 'settings', label: 'Параметры', icon: <SlidersHorizontal size={15} /> },
];

const channelPeriodOptions: Array<GlassSelectOption<AdminChannelPeriod>> = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

const settingSections: Array<{
  id: SettingsSectionId;
  number: number;
  title: string;
  icon: JSX.Element;
}> = [
  { id: 'daily', number: 1, title: 'Ежедневная игра', icon: <Gamepad2 size={18} /> },
  { id: 'training', number: 2, title: 'Тренировка', icon: <Dumbbell size={18} /> },
  { id: 'amateur', number: 3, title: 'Любительская лига', icon: <Trophy size={18} /> },
  { id: 'pro', number: 4, title: 'Профессиональная лига', icon: <Medal size={18} /> },
];

const levelLabels: Record<Exclude<AdminLevelFilter, 'all'>, string> = {
  beginner: 'Новичок',
  amateur: 'Любитель',
  professional: 'Профессионал',
};

const roleFilterOptions: Array<GlassSelectOption<'all' | AdminRole>> = [
  { value: 'all', label: 'Все' },
  { value: 'player', label: 'Игроки' },
  { value: 'admin', label: 'Админы' },
];

const levelFilterOptions: Array<GlassSelectOption<AdminLevelFilter>> = [
  { value: 'all', label: 'Все' },
  { value: 'beginner', label: 'Новичок' },
  { value: 'amateur', label: 'Любитель' },
  { value: 'professional', label: 'Профессионал' },
];

const sortFieldOptions: Array<GlassSelectOption<SortField>> = [
  { value: 'name', label: 'Имя' },
  { value: 'goals', label: 'Голы' },
  { value: 'accuracy', label: 'Точность' },
];

const gripOptions: Array<GlassSelectOption<'right' | 'left'>> = [
  { value: 'right', label: 'Правый' },
  { value: 'left', label: 'Левый' },
];

const roleOptions: Array<GlassSelectOption<AdminRole>> = [
  { value: 'player', label: 'player' },
  { value: 'admin', label: 'admin' },
];

const paymentStatusOptions: Array<GlassSelectOption<'all' | AdminPaymentStatus>> = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидает' },
  { value: 'paid', label: 'Оплачен' },
  { value: 'failed', label: 'Ошибка' },
  { value: 'refunded', label: 'Возврат' },
  { value: 'canceled', label: 'Отменён' },
];

const paymentSortOptions: Array<GlassSelectOption<AdminPaymentSort>> = [
  { value: 'created_desc', label: 'Новые' },
  { value: 'created_asc', label: 'Старые' },
  { value: 'amount_desc', label: 'Цена ↓' },
  { value: 'amount_asc', label: 'Цена ↑' },
  { value: 'user_asc', label: 'Игрок А-я' },
  { value: 'user_desc', label: 'Игрок Я-а' },
];

const feedbackStatusOptions: Array<GlassSelectOption<AdminFeedbackStatus>> = [
  { value: 'unread', label: 'Непрочитанные' },
  { value: 'all', label: 'Все' },
  { value: 'read', label: 'Прочитанные' },
];

const feedbackKindOptions: Array<GlassSelectOption<'all' | AdminFeedbackKind>> = [
  { value: 'all', label: 'Все типы' },
  { value: 'review', label: 'Отзывы' },
  { value: 'suggestion', label: 'Пожелания' },
  { value: 'question', label: 'Вопросы' },
];

const pushNotificationTypeItems: Array<{
  key: keyof AdminUser['pushNotifications']['types'];
  label: string;
  shortLabel: string;
}> = [
  { key: 'chatNewDialogMessage', label: 'Первое сообщение в личке', shortLabel: 'Личка' },
  { key: 'dailyGame', label: 'Ежедневная игра', shortLabel: 'Дневная' },
  { key: 'trainingAvailable', label: 'Тренировка доступна', shortLabel: 'Тренировка' },
  { key: 'gameNews', label: 'Новости игры', shortLabel: 'Новости' },
];

function toAdminSort(field: SortField, direction: SortDirection): AdminSort {
  return `${field}_${direction}` as AdminSort;
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function pluralText(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many;
  return `${numberText(value)} ${word}`;
}

function goalsText(value: number): string {
  return pluralText(value, 'гол', 'гола', 'голов');
}

function settingValueText(setting: AdminGameSetting, value: GameSettingValue): string {
  if (setting.type === 'select') {
    return (
      setting.options?.find((option) => option.value === String(value))?.label ?? String(value)
    );
  }
  return String(value);
}

function moneyText(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function roleLabel(role: AdminRole): string {
  return role === 'admin' ? 'Админ' : 'Игрок';
}

function levelLabel(level: AdminUser['competitionLevel']): string {
  return levelLabels[level];
}

function paymentStatusLabel(status: AdminPaymentStatus): string {
  return paymentStatusOptions.find((option) => option.value === status)?.label ?? status;
}

function percentText(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}%`;
}

function enabledPushTypeLabels(
  pushNotifications: AdminUser['pushNotifications'],
  label: 'label' | 'shortLabel' = 'label',
): string[] {
  if (!pushNotifications.subscribed) return [];
  return pushNotificationTypeItems
    .filter((item) => pushNotifications.types[item.key])
    .map((item) => item[label]);
}

function pushNotificationText(pushNotifications: AdminUser['pushNotifications']): string {
  if (!pushNotifications.subscribed) return 'Уведомления выкл.';
  const enabled = enabledPushTypeLabels(pushNotifications, 'shortLabel');
  return enabled.length > 0 ? `Пуши: ${enabled.join(', ')}` : 'Пуши: все типы выключены';
}

function feedbackKindLabel(kind: AdminFeedbackKind): string {
  return (
    {
      review: 'Отзыв',
      suggestion: 'Пожелание',
      question: 'Вопрос',
    } satisfies Record<AdminFeedbackKind, string>
  )[kind];
}

function dateText(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function dateTimeText(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function fieldNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function isHiddenGameSetting(setting: AdminGameSetting): boolean {
  return setting.key.endsWith('.goalie_id');
}

function dailySpeedPeriod(setting: AdminGameSetting): 1 | 2 | 3 | null {
  const match = /^daily\.period_([1-3])\./.exec(setting.key);
  if (!match) return null;
  return Number(match[1]) as 1 | 2 | 3;
}

function AdminPlainState({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      style={{
        padding: '8px 2px',
        color: 'var(--muted)',
        fontSize: 14,
        fontWeight: 800,
        lineHeight: 1.35,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function minutesText(value: number): string {
  if (value <= 0) return '0 мин';
  if (value < 60) return `${numberText(value)} мин`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes > 0 ? `${numberText(hours)} ч ${minutes} мин` : `${numberText(hours)} ч`;
}

function shortDateText(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso.slice(5);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date);
}

export function AdminScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [roleFilter, setRoleFilter] = useState<'all' | AdminRole>('all');
  const [levelFilter, setLevelFilter] = useState<AdminLevelFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [minGoals, setMinGoals] = useState('');
  const [minAccuracy, setMinAccuracy] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const debouncedPaymentSearch = useDebouncedValue(paymentSearch, 250);
  const [paymentStatus, setPaymentStatus] = useState<'all' | AdminPaymentStatus>('all');
  const [paymentSort, setPaymentSort] = useState<AdminPaymentSort>('created_desc');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<AdminFeedbackStatus>('unread');
  const [feedbackKind, setFeedbackKind] = useState<'all' | AdminFeedbackKind>('all');
  const [channelPeriod, setChannelPeriod] = useState<AdminChannelPeriod>('30d');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const filtersChanged =
    search !== '' ||
    roleFilter !== 'all' ||
    levelFilter !== 'all' ||
    sortField !== 'name' ||
    sortDirection !== 'asc' ||
    minGoals !== '' ||
    minAccuracy !== '';
  const paymentFiltersChanged =
    paymentSearch !== '' ||
    paymentStatus !== 'all' ||
    paymentSort !== 'created_desc' ||
    minAmount !== '' ||
    maxAmount !== '';

  function resetUserFilters(): void {
    setSearch('');
    setRoleFilter('all');
    setLevelFilter('all');
    setSortField('name');
    setSortDirection('asc');
    setMinGoals('');
    setMinAccuracy('');
  }

  function resetPaymentFilters(): void {
    setPaymentSearch('');
    setPaymentStatus('all');
    setPaymentSort('created_desc');
    setMinAmount('');
    setMaxAmount('');
  }

  const canTryAdmin = user !== null && user.role !== 'player';
  const usersQuery = {
    q: debouncedSearch,
    role: roleFilter,
    level: levelFilter,
    sort: toAdminSort(sortField, sortDirection),
    minGoals,
    minAccuracy,
  };
  const users = useQuery({
    queryKey: ['admin', 'users', usersQuery],
    queryFn: () => fetchAdminUsers(usersQuery),
    enabled: canTryAdmin,
  });
  const summary = useQuery({
    queryKey: ['admin', 'summary'],
    queryFn: fetchAdminSummary,
    enabled: canTryAdmin && tab === 'dashboard',
  });
  const settings = useQuery({
    queryKey: ['admin', 'game-settings'],
    queryFn: fetchAdminGameSettings,
    enabled: canTryAdmin && tab === 'settings',
  });
  const paymentsQuery = {
    q: debouncedPaymentSearch,
    status: paymentStatus,
    sort: paymentSort,
    minAmount,
    maxAmount,
  };
  const payments = useQuery({
    queryKey: ['admin', 'payments', paymentsQuery],
    queryFn: () => fetchAdminPayments(paymentsQuery),
    enabled: canTryAdmin && tab === 'payments',
  });
  const feedbackQuery = {
    kind: feedbackKind,
    status: feedbackStatus,
  };
  const feedback = useQuery({
    queryKey: ['admin', 'feedback', feedbackQuery],
    queryFn: () => fetchAdminFeedback(feedbackQuery),
    enabled: canTryAdmin,
  });
  const channel = useQuery({
    queryKey: ['admin', 'channel', channelPeriod],
    queryFn: () => fetchAdminChannelNews(channelPeriod),
    enabled: canTryAdmin && tab === 'channel',
  });
  const inventory = useQuery({
    queryKey: ['admin', 'inventory'],
    queryFn: fetchAdminInventory,
    enabled: canTryAdmin && tab === 'inventory',
  });

  const denied =
    user?.role === 'player' ||
    [
      users.error,
      summary.error,
      settings.error,
      payments.error,
      inventory.error,
      feedback.error,
      channel.error,
    ].some((error) => error instanceof ApiError && error.status === 403);

  const selectedUser = users.data?.users.find((item) => item.id === selectedUserId) ?? null;
  const feedbackUnreadCount = feedback.data?.unreadCount ?? 0;

  if (denied) {
    return (
      <main className="screen" style={{ padding: 'calc(22px + var(--app-safe-top)) 14px' }}>
        <section style={{ padding: '10px 2px' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)' }}>Нет доступа</div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>
            Этот раздел доступен только команде проекта.
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
      <nav
        className="glass no-scrollbar"
        style={{
          borderRadius: 20,
          padding: 5,
          display: 'flex',
          alignItems: 'center',
          minHeight: 54,
          flex: '0 0 auto',
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          scrollSnapType: 'x proximity',
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
              flex: '0 0 auto',
              minWidth: 146,
              height: 42,
              borderRadius: 16,
              padding: '9px 14px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              scrollSnapAlign: 'start',
            }}
          >
            {item.icon}
            {item.id === 'feedback' ? `${item.label} (${feedbackUnreadCount})` : item.label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <DashboardPanel loading={summary.isLoading} dashboard={summary.data?.dashboard ?? null} />
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
          roleFilter={roleFilter}
          onRoleFilter={setRoleFilter}
          levelFilter={levelFilter}
          onLevelFilter={setLevelFilter}
          sortField={sortField}
          onSortField={setSortField}
          sortDirection={sortDirection}
          onSortDirection={setSortDirection}
          minGoals={minGoals}
          onMinGoals={setMinGoals}
          minAccuracy={minAccuracy}
          onMinAccuracy={setMinAccuracy}
          filtersChanged={filtersChanged}
          onResetFilters={resetUserFilters}
          onCloseUser={() => setSelectedUserId(null)}
        />
      )}
      {tab === 'channel' && (
        <ChannelPanel
          loading={channel.isLoading}
          data={channel.data}
          period={channelPeriod}
          onPeriod={setChannelPeriod}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'channel'] });
          }}
        />
      )}
      {tab === 'payments' && (
        <PaymentsPanel
          loading={payments.isLoading}
          payments={payments.data?.payments ?? []}
          total={payments.data?.total ?? 0}
          analytics={payments.data?.analytics}
          search={paymentSearch}
          onSearch={setPaymentSearch}
          status={paymentStatus}
          onStatus={setPaymentStatus}
          sort={paymentSort}
          onSort={setPaymentSort}
          minAmount={minAmount}
          onMinAmount={setMinAmount}
          maxAmount={maxAmount}
          onMaxAmount={setMaxAmount}
          filtersChanged={paymentFiltersChanged}
          onResetFilters={resetPaymentFilters}
        />
      )}
      {tab === 'inventory' && (
        <InventoryPanel
          loading={inventory.isLoading}
          items={inventory.data?.items ?? []}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
          }}
        />
      )}
      {tab === 'feedback' && (
        <FeedbackPanel
          loading={feedback.isLoading}
          feedback={feedback.data?.feedback ?? []}
          total={feedback.data?.total ?? 0}
          unreadCount={feedbackUnreadCount}
          status={feedbackStatus}
          onStatus={setFeedbackStatus}
          kind={feedbackKind}
          onKind={setFeedbackKind}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] });
          }}
        />
      )}
      {tab === 'settings' && (
        <SettingsPanel
          loading={settings.isLoading}
          settings={settings.data?.settings ?? []}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'game-settings'] });
          }}
        />
      )}
    </main>
  );
}

function DashboardPanel({
  loading,
  dashboard,
}: {
  loading: boolean;
  dashboard: AdminDashboard | null;
}): JSX.Element {
  if (loading || dashboard === null) {
    return (
      <>
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          Дашборд
        </div>
        <AdminPlainState>Собираем цифры проекта...</AdminPlainState>
      </>
    );
  }

  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Дашборд
      </div>
      <DashboardHero dashboard={dashboard} />
      <DashboardMetricGrid dashboard={dashboard} />
      <UserNotificationStats stats={dashboard.notifications} loading={false} />
      <DashboardChartCard
        title="Активные пользователи"
        subtitle="30 дней"
        series={dashboard.series}
        valueKey="activeUsers"
        color="#1d4ed8"
      />
      <DashboardChartCard
        title="Новые пользователи"
        subtitle="30 дней"
        series={dashboard.series}
        valueKey="newUsers"
        color="#0f766e"
      />
      <DashboardChartCard
        title="Выручка"
        subtitle="30 дней"
        series={dashboard.series}
        valueKey="revenueRub"
        color="#7c2d12"
        formatValue={moneyText}
      />
      <DashboardChartCard
        title="Броски"
        subtitle="30 дней"
        series={dashboard.series}
        valueKey="shots"
        color="#4338ca"
      />
      <DashboardChartCard
        title="Сообщения"
        subtitle="30 дней"
        series={dashboard.series}
        valueKey="messages"
        color="#047857"
      />
    </>
  );
}

function DashboardHero({ dashboard }: { dashboard: AdminDashboard }): JSX.Element {
  return (
    <section
      className="glass"
      style={{
        borderRadius: 22,
        padding: 14,
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 19, fontWeight: 950 }}>Ultimate Hockey</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontWeight: 750 }}>
            Игроки, деньги, активность и игра
          </div>
        </div>
        <span className="pill pill--dark">{numberText(dashboard.users.total)} игроков</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <DashboardMiniStat
          label="Активны сегодня"
          value={numberText(dashboard.users.activeToday)}
          note={`вчера ${numberText(dashboard.users.activeYesterday)}`}
        />
        <DashboardMiniStat
          label="Выручка 30д"
          value={moneyText(dashboard.payments.revenue30dRub)}
          note={`год ${moneyText(dashboard.payments.revenueYearRub)}`}
        />
        <DashboardMiniStat
          label="Точность 30д"
          value={percentText(dashboard.game.accuracy30d)}
          note={`${numberText(dashboard.game.goals30d)} голов`}
        />
      </div>
    </section>
  );
}

function DashboardMiniStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}): JSX.Element {
  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.72)',
        borderRadius: 16,
        padding: '10px 9px',
        background: 'rgba(255, 255, 255, 0.32)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 850,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 5,
          color: 'var(--ink)',
          fontSize: 17,
          fontWeight: 950,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 3,
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 750,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {note}
      </div>
    </div>
  );
}

function DashboardMetricGrid({ dashboard }: { dashboard: AdminDashboard }): JSX.Element {
  const cards = [
    {
      label: 'Всего игроков',
      value: numberText(dashboard.users.total),
      note: `+${numberText(dashboard.users.new30d)} за 30д`,
    },
    {
      label: 'Активные',
      value: numberText(dashboard.users.active30d),
      note: `7д ${numberText(dashboard.users.active7d)} · год ${numberText(dashboard.users.active365d)}`,
    },
    {
      label: 'DAU / WAU',
      value: percentText(dashboard.engagement.dauWauPercent),
      note: `WAU / MAU ${percentText(dashboard.engagement.wauMauPercent)}`,
    },
    {
      label: 'Время в приложении',
      value: minutesText(dashboard.engagement.avgDailyActivitySpanMinutes),
      note: 'среднее окно активности',
    },
    {
      label: 'Платящие',
      value: numberText(dashboard.payments.paidUsersTotal),
      note: `${percentText(dashboard.payments.payerConversionPercent)} от игроков`,
    },
    {
      label: 'ARPU 30д',
      value: moneyText(dashboard.payments.arpu30dRub),
      note: `ARPPU ${moneyText(dashboard.payments.arppu30dRub)}`,
    },
    {
      label: 'Броски 30д',
      value: numberText(dashboard.game.shots30d),
      note: `${numberText(dashboard.game.dailyPlayers30d)} daily · ${numberText(dashboard.game.trainingPlayers30d)} training`,
    },
    {
      label: 'Броски всего',
      value: numberText(dashboard.game.shotsTotal),
      note: `${numberText(dashboard.game.goalsTotal)} голов`,
    },
    {
      label: 'Чат',
      value: numberText(dashboard.chat.messages30d),
      note: `${numberText(dashboard.chat.activeUsers30d)} авторов за 30д`,
    },
    {
      label: 'Фидбек',
      value: numberText(dashboard.feedback.unread),
      note: `${numberText(dashboard.feedback.total)} всего`,
    },
    {
      label: 'Инвентарь',
      value: numberText(dashboard.inventory.activeItems),
      note: 'активных предметов',
    },
    {
      label: 'Мисматчи',
      value: numberText(dashboard.game.mismatches30d),
      note: 'за 30 дней',
    },
  ];
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {cards.map((card) => (
        <DashboardMetricCard key={card.label} {...card} />
      ))}
    </section>
  );
}

function DashboardMetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}): JSX.Element {
  return (
    <article
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        minHeight: 96,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: 'var(--ink)',
          fontSize: 23,
          lineHeight: 1,
          fontWeight: 950,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 850 }}>{label}</div>
        <div
          style={{
            marginTop: 4,
            color: 'var(--ink)',
            fontSize: 11,
            fontWeight: 750,
            lineHeight: 1.25,
          }}
        >
          {note}
        </div>
      </div>
    </article>
  );
}

function DashboardChartCard({
  title,
  subtitle,
  series,
  valueKey,
  color,
  formatValue = numberText,
}: {
  title: string;
  subtitle: string;
  series: AdminDashboardSeriesPoint[];
  valueKey: keyof Pick<
    AdminDashboardSeriesPoint,
    'newUsers' | 'activeUsers' | 'revenueRub' | 'shots' | 'goals' | 'messages'
  >;
  color: string;
  formatValue?: (value: number) => string;
}): JSX.Element {
  const values = series.map((point) => point[valueKey]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(0, ...values);
  return (
    <section className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>{title}</div>
          <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>
            {subtitle}
          </div>
        </div>
        <span className="pill" style={{ fontSize: 11 }}>
          {formatValue(total)}
        </span>
      </div>
      <MiniLineChart series={series} values={values} color={color} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 750,
        }}
      >
        <span>Пик {formatValue(peak)}</span>
        <span>{series.length > 0 ? shortDateText(series[series.length - 1]!.date) : '-'}</span>
      </div>
    </section>
  );
}

function MiniLineChart({
  series,
  values,
  color,
}: {
  series: AdminDashboardSeriesPoint[];
  values: number[];
  color: string;
}): JSX.Element {
  const width = 320;
  const height = 142;
  const padding = 20;
  const max = Math.max(1, ...values);
  const step = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const points = values
    .map((value, index) => {
      const x = padding + step * index;
      const y = height - padding - (value / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const first = series[0]?.date;
  const middle = series[Math.floor(series.length / 2)]?.date;
  const last = series[series.length - 1]?.date;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="График за 30 дней"
      style={{ width: '100%', height: 142, display: 'block' }}
    >
      {[0, 1, 2, 3].map((line) => {
        const y = padding + ((height - padding * 2) / 3) * line;
        return (
          <line
            key={line}
            x1={padding}
            x2={width - padding}
            y1={y}
            y2={y}
            stroke="rgba(15, 23, 42, 0.12)"
            strokeDasharray="4 5"
          />
        );
      })}
      <line
        x1={padding}
        x2={padding}
        y1={padding}
        y2={height - padding}
        stroke="rgba(15, 23, 42, 0.38)"
      />
      <line
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
        stroke="rgba(15, 23, 42, 0.38)"
      />
      {points ? (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {first && (
        <text x={padding} y={height - 4} fill="rgba(15, 23, 42, 0.58)" fontSize="10">
          {shortDateText(first)}
        </text>
      )}
      {middle && (
        <text
          x={width / 2}
          y={height - 4}
          fill="rgba(15, 23, 42, 0.58)"
          fontSize="10"
          textAnchor="middle"
        >
          {shortDateText(middle)}
        </text>
      )}
      {last && (
        <text
          x={width - padding}
          y={height - 4}
          fill="rgba(15, 23, 42, 0.58)"
          fontSize="10"
          textAnchor="end"
        >
          {shortDateText(last)}
        </text>
      )}
    </svg>
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
  roleFilter,
  onRoleFilter,
  levelFilter,
  onLevelFilter,
  sortField,
  onSortField,
  sortDirection,
  onSortDirection,
  minGoals,
  onMinGoals,
  minAccuracy,
  onMinAccuracy,
  filtersChanged,
  onResetFilters,
  onCloseUser,
}: {
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  users: AdminUser[];
  total: number;
  selectedUser: AdminUser | null;
  selectedUserId: string | null;
  onSelectUser: (value: string) => void;
  roleFilter: 'all' | AdminRole;
  onRoleFilter: (value: 'all' | AdminRole) => void;
  levelFilter: AdminLevelFilter;
  onLevelFilter: (value: AdminLevelFilter) => void;
  sortField: SortField;
  onSortField: (value: SortField) => void;
  sortDirection: SortDirection;
  onSortDirection: (value: SortDirection) => void;
  minGoals: string;
  onMinGoals: (value: string) => void;
  minAccuracy: string;
  onMinAccuracy: (value: string) => void;
  filtersChanged: boolean;
  onResetFilters: () => void;
  onCloseUser: () => void;
}): JSX.Element {
  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Игроки ({loading ? '-' : numberText(total)})
      </div>
      <label
        className="glass"
        style={{
          borderRadius: 999,
          padding: '0 12px',
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={14} color="var(--muted)" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Имя, username или tg id"
          aria-label="Поиск игроков"
          style={{
            flex: 1,
            minWidth: 0,
            width: 'auto',
            height: 'auto',
            padding: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: 'none',
          }}
        />
      </label>
      <section
        className="glass"
        style={{
          borderRadius: 18,
          padding: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <AdminField label="Роль">
          <GlassSelect
            value={roleFilter}
            options={roleFilterOptions}
            onChange={onRoleFilter}
            ariaLabel="Фильтр по роли"
          />
        </AdminField>
        <AdminField label="Уровень">
          <GlassSelect
            value={levelFilter}
            options={levelFilterOptions}
            onChange={onLevelFilter}
            ariaLabel="Фильтр по уровню"
          />
        </AdminField>
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 104px',
            gap: 8,
            minWidth: 0,
          }}
        >
          <AdminField label="Сортировка">
            <GlassSelect
              value={sortField}
              options={sortFieldOptions}
              onChange={onSortField}
              ariaLabel="Поле сортировки"
            />
          </AdminField>
          <AdminField label="Порядок">
            <button
              type="button"
              className="icon-btn"
              aria-label={
                sortDirection === 'asc'
                  ? 'Порядок сортировки по возрастанию'
                  : 'Порядок сортировки по убыванию'
              }
              title={
                sortDirection === 'asc'
                  ? 'Порядок сортировки по возрастанию'
                  : 'Порядок сортировки по убыванию'
              }
              onClick={() => onSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 14,
                background: 'rgba(255, 255, 255, 0.52)',
                gap: 7,
                fontSize: 12,
                fontWeight: 850,
              }}
            >
              {sortDirection === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              {sortDirection === 'asc' ? 'Возр.' : 'Убыв.'}
            </button>
          </AdminField>
        </div>
        <AdminField label="Голы от">
          <input
            value={minGoals}
            inputMode="numeric"
            onChange={(event) => onMinGoals(event.target.value.replace(/\D/g, ''))}
          />
        </AdminField>
        <AdminField label="Точн. от %">
          <input
            value={minAccuracy}
            inputMode="numeric"
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
              onMinAccuracy(digits === '' ? '' : String(Math.min(100, Number(digits))));
            }}
          />
        </AdminField>
        <button
          type="button"
          className="chip"
          onClick={onResetFilters}
          disabled={!filtersChanged}
          style={{
            gridColumn: '1 / -1',
            height: 38,
            borderRadius: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            color: filtersChanged ? 'var(--ink)' : 'var(--muted)',
            opacity: filtersChanged ? 1 : 0.62,
            cursor: filtersChanged ? 'pointer' : 'not-allowed',
          }}
        >
          <RotateCcw size={14} />
          Сбросить фильтры
        </button>
      </section>
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
                {roleLabel(user.role)} · {levelLabel(user.competitionLevel)} ·{' '}
                {goalsText(user.lifetimeGoalsTotal)} · {user.accuracy}%
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: user.pushNotifications.subscribed ? 'var(--ink)' : 'var(--muted)',
                  fontSize: 10,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 0,
                }}
              >
                {user.pushNotifications.subscribed ? <Bell size={12} /> : <BellOff size={12} />}
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pushNotificationText(user.pushNotifications)}
                </span>
              </div>
              {user.isBlocked && (
                <span className="pill" style={{ marginTop: 7, padding: '3px 8px', fontSize: 10 }}>
                  Заблокирован
                </span>
              )}
            </div>
            <ChevronRight size={18} color="var(--muted)" />
          </button>
        ))}
        {!loading && users.length === 0 && <AdminPlainState>Ничего не найдено</AdminPlainState>}
      </section>
      {selectedUser !== null && (
        <UserDetailsModal userId={selectedUser.id} fallback={selectedUser} onClose={onCloseUser} />
      )}
    </>
  );
}

function UserNotificationStats({
  stats,
  loading,
}: {
  stats: AdminNotificationStats | null;
  loading: boolean;
}): JSX.Element {
  const subscribed = stats?.subscribed;
  return (
    <section
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '32px minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 12,
            background: subscribed && subscribed.count > 0 ? 'rgba(15, 23, 42, 0.92)' : '#eef4fb',
            color: subscribed && subscribed.count > 0 ? '#ffffff' : 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {subscribed && subscribed.count > 0 ? <Bell size={17} /> : <BellOff size={17} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>Уведомления</div>
          <div style={{ marginTop: 2, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>
            {loading || !stats
              ? 'Считаем подписки'
              : `${numberText(subscribed?.count ?? 0)} из ${numberText(stats.totalUsers)} пользователей`}
          </div>
        </div>
        <div
          className="pill pill--dark"
          style={{ padding: '6px 10px', fontSize: 13, fontWeight: 950 }}
        >
          {loading || !subscribed ? '-' : percentText(subscribed.percent)}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 7,
        }}
      >
        {pushNotificationTypeItems.map((item) => {
          const typeStats = stats?.types[item.key];
          return (
            <div
              key={item.key}
              style={{
                border: '1px solid rgba(255, 255, 255, 0.72)',
                borderRadius: 14,
                padding: '8px 9px',
                background: 'rgba(255, 255, 255, 0.32)',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: 'var(--muted)',
                  fontSize: 10,
                  fontWeight: 850,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.shortLabel}
              </div>
              <div style={{ marginTop: 3, color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
                {loading || !typeStats ? '-' : percentText(typeStats.percent)}
              </div>
              <div style={{ marginTop: 1, color: 'var(--muted)', fontSize: 10, fontWeight: 750 }}>
                {loading || !typeStats ? '-' : numberText(typeStats.count)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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

function UserDetailsModal({
  userId,
  fallback,
  onClose,
}: {
  userId: string;
  fallback: AdminUser;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchAdminUser(userId),
  });
  const user = detail.data?.user ?? fallback;
  const [editMode, setEditMode] = useState(false);
  const [showPurchases, setShowPurchases] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<AdminAchievement | null>(null);
  const [confirmAction, setConfirmAction] = useState<'save' | 'block' | null>(null);
  const [role, setRole] = useState<AdminRole>(user.role);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [grip, setGrip] = useState(user.grip);
  const [level, setLevel] = useState(fieldNumber(user.level));
  const [xp, setXp] = useState(fieldNumber(user.xp));
  const [lifetimeShots, setLifetimeShots] = useState(fieldNumber(user.lifetimeShotsTotal));
  const [lifetimeGoals, setLifetimeGoals] = useState(fieldNumber(user.lifetimeGoalsTotal));
  const [pucks, setPucks] = useState(fieldNumber(user.wallet.pucks));
  const [goldPucks, setGoldPucks] = useState(fieldNumber(user.wallet.goldPucks));
  const [shotsCurrent, setShotsCurrent] = useState(fieldNumber(user.wallet.shotsCurrent));
  const [shotsMax, setShotsMax] = useState(fieldNumber(user.wallet.shotsMax));

  useEffect(() => {
    setRole(user.role);
    setDisplayName(user.displayName);
    setGrip(user.grip);
    setLevel(fieldNumber(user.level));
    setXp(fieldNumber(user.xp));
    setLifetimeShots(fieldNumber(user.lifetimeShotsTotal));
    setLifetimeGoals(fieldNumber(user.lifetimeGoalsTotal));
    setPucks(fieldNumber(user.wallet.pucks));
    setGoldPucks(fieldNumber(user.wallet.goldPucks));
    setShotsCurrent(fieldNumber(user.wallet.shotsCurrent));
    setShotsMax(fieldNumber(user.wallet.shotsMax));
  }, [user]);

  useEffect(() => {
    setShowPurchases(false);
    setSelectedAchievement(null);
  }, [user.id]);

  const saveMutation = useMutation({
    mutationFn: () => patchAdminUser(user.id, buildUserPatch()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.id] });
      setEditMode(false);
      setConfirmAction(null);
    },
  });

  const blockMutation = useMutation({
    mutationFn: () => patchAdminUser(user.id, { isBlocked: !user.isBlocked }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user', user.id] });
      setConfirmAction(null);
    },
  });

  function buildUserPatch(): AdminUserPatch {
    return {
      role,
      displayName,
      grip,
      level: Number(level),
      xp: Number(xp),
      lifetimeShotsTotal: Number(lifetimeShots),
      lifetimeGoalsTotal: Number(lifetimeGoals),
      wallet: {
        pucks: Number(pucks),
        goldPucks: Number(goldPucks),
        shotsCurrent: Number(shotsCurrent),
        shotsMax: Number(shotsMax),
      },
    };
  }

  const pending = saveMutation.isPending || blockMutation.isPending;
  const purchases = detail.data?.purchases ?? [];
  const purchaseSummary = detail.data?.purchaseSummary ?? { totalRubSpent: 0, purchasesCount: 0 };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Игрок ${user.displayName}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(16px + var(--app-safe-top)) 14px calc(16px + var(--app-safe-bottom))',
      }}
    >
      <section
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 430,
          maxHeight: '100%',
          overflowY: 'auto',
          borderRadius: 24,
          padding: 16,
          color: 'var(--ink)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 34,
            height: 34,
            background: 'rgba(255,255,255,0.62)',
          }}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 42 }}>
          <UserAvatar user={user} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 19,
                fontWeight: 950,
                color: 'var(--ink)',
                overflowWrap: 'anywhere',
              }}
            >
              {user.displayName}
            </div>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>
              В игре с {dateText(user.createdAt)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="pill pill--dark">{roleLabel(user.role)}</span>
          <span className="pill">{levelLabel(user.competitionLevel)}</span>
          {user.isBlocked && <span className="pill">Заблокирован</span>}
        </div>

        <UserStatsRow user={user} />
        <AdminAchievementsRow
          achievements={detail.data?.achievements ?? []}
          onOpenAchievement={setSelectedAchievement}
        />

        <IdentityCards identities={user.identities} />

        <MetaPair
          left={{ label: 'Часовой пояс', value: user.timezone }}
          right={{ label: 'Последний визит', value: dateText(user.lastSeenAt) }}
        />

        <PushNotificationCard pushNotifications={user.pushNotifications} />

        <section style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          {user.isBlocked && (
            <InfoRow
              label="Блокировка"
              value={`${dateText(user.blockedAt)} · ${user.blockedByDisplayName ?? 'админ'}`}
            />
          )}
        </section>

        <PurchasesCard
          summary={purchaseSummary}
          purchases={purchases}
          expanded={showPurchases}
          onToggle={() => setShowPurchases((value) => !value)}
        />

        {editMode && (
          <section style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <AdminField label="Имя">
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </AdminField>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <AdminField label="Роль">
                <GlassSelect
                  value={role}
                  options={roleOptions}
                  onChange={setRole}
                  ariaLabel="Роль игрока"
                />
              </AdminField>
              <AdminField label="Хват">
                <GlassSelect
                  value={grip}
                  options={gripOptions}
                  onChange={setGrip}
                  ariaLabel="Хват игрока"
                />
              </AdminField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <AdminField label="Level">
                <input value={level} onChange={(event) => setLevel(event.target.value)} />
              </AdminField>
              <AdminField label="XP">
                <input value={xp} onChange={(event) => setXp(event.target.value)} />
              </AdminField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <AdminField label="Броски всего">
                <input
                  value={lifetimeShots}
                  onChange={(event) => setLifetimeShots(event.target.value)}
                />
              </AdminField>
              <AdminField label="Голы всего">
                <input
                  value={lifetimeGoals}
                  onChange={(event) => setLifetimeGoals(event.target.value)}
                />
              </AdminField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <AdminField label="Шайбы">
                <input value={pucks} onChange={(event) => setPucks(event.target.value)} />
              </AdminField>
              <AdminField label="Золото">
                <input value={goldPucks} onChange={(event) => setGoldPucks(event.target.value)} />
              </AdminField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <AdminField label="Броски">
                <input
                  value={shotsCurrent}
                  onChange={(event) => setShotsCurrent(event.target.value)}
                />
              </AdminField>
              <AdminField label="Макс. бросков">
                <input value={shotsMax} onChange={(event) => setShotsMax(event.target.value)} />
              </AdminField>
            </div>
          </section>
        )}

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setConfirmAction('block')}
            disabled={pending}
            style={{ padding: '12px 10px', fontSize: 12, letterSpacing: 0 }}
          >
            {user.isBlocked ? <UserCheck size={15} /> : <Ban size={15} />}
            {user.isBlocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
          {editMode ? (
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => setConfirmAction('save')}
              disabled={pending}
              style={{ padding: '12px 10px', fontSize: 12, letterSpacing: 0 }}
            >
              <Save size={15} />
              Сохранить
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => setEditMode(true)}
              disabled={pending}
              style={{ padding: '12px 10px', fontSize: 12, letterSpacing: 0 }}
            >
              <Pencil size={15} />
              Редактировать
            </button>
          )}
        </div>

        {(saveMutation.isError || blockMutation.isError) && (
          <div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>
            {(saveMutation.error ?? blockMutation.error) instanceof Error
              ? (saveMutation.error ?? blockMutation.error)?.message
              : 'Ошибка сохранения'}
          </div>
        )}

        {confirmAction !== null && (
          <ConfirmAction
            title={confirmAction === 'save' ? 'Подтвердить изменения' : 'Подтвердить блокировку'}
            text={
              confirmAction === 'save'
                ? 'Изменения сразу применятся к аккаунту игрока.'
                : user.isBlocked
                  ? 'Игрок снова сможет пользоваться игрой.'
                  : 'Игрок потеряет доступ к игре после подтверждения.'
            }
            confirmLabel={
              confirmAction === 'save'
                ? 'Применить'
                : user.isBlocked
                  ? 'Разблокировать'
                  : 'Заблокировать'
            }
            pending={pending}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              if (confirmAction === 'save') saveMutation.mutate();
              else blockMutation.mutate();
            }}
          />
        )}
        {selectedAchievement !== null && (
          <AchievementDetailsSheet
            achievement={selectedAchievement}
            onClose={() => setSelectedAchievement(null)}
          />
        )}
      </section>
    </div>,
    document.body,
  );
}

function UserStatsRow({ user }: { user: AdminUser }): JSX.Element {
  const items = [
    { label: 'Броски', value: numberText(user.lifetimeShotsTotal) },
    { label: 'Голы', value: numberText(user.lifetimeGoalsTotal) },
    { label: 'Точность', value: `${user.accuracy}%` },
    { label: 'Шайбы', value: numberText(user.wallet.pucks) },
  ];
  return (
    <section
      className="glass"
      style={{
        marginTop: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 6,
        borderRadius: 18,
        padding: '10px 8px',
      }}
    >
      {items.map((item) => (
        <div key={item.label} style={{ minWidth: 0, textAlign: 'center' }}>
          <div
            style={{
              color: 'var(--muted)',
              fontSize: 9,
              fontWeight: 850,
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              marginTop: 5,
              color: 'var(--ink)',
              fontSize: 19,
              lineHeight: 1,
              fontWeight: 950,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.value}
          </div>
        </div>
      ))}
    </section>
  );
}

function AdminAchievementsRow({
  achievements,
  onOpenAchievement,
}: {
  achievements: AdminAchievement[];
  onOpenAchievement: (achievement: AdminAchievement) => void;
}): JSX.Element {
  const unlocked = achievements.filter((achievement) => achievement.isUnlocked).length;

  return (
    <section
      className="glass"
      style={{ marginTop: 10, borderRadius: 18, padding: '10px 10px 8px' }}
    >
      <div
        style={{
          color: 'var(--muted)',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        Достижения{achievements.length > 0 ? ` (${unlocked}/${achievements.length})` : ''}
      </div>
      {achievements.length > 0 ? (
        <div
          style={{
            marginTop: 9,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            overflowX: 'auto',
            overflowY: 'hidden',
            overscrollBehaviorX: 'contain',
            scrollSnapType: 'x proximity',
            minHeight: 95,
          }}
        >
          {achievements.map((achievement) => (
            <AchievementTile
              key={achievement.id}
              achievement={achievement}
              onOpen={() => onOpenAchievement(achievement)}
            />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
          Достижения не загружены.
        </div>
      )}
    </section>
  );
}

function IdentityCards({ identities }: { identities: AdminIdentity[] }): JSX.Element {
  return (
    <section
      style={{
        marginTop: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8,
      }}
    >
      {identities.map((identity) => (
        <IdentityCard key={identity.source} identity={identity} />
      ))}
    </section>
  );
}

function IdentityCard({ identity }: { identity: AdminIdentity }): JSX.Element {
  const title = identity.linked || identity.active ? identity.displayName : 'Не подключен';
  const subtitle = identity.id ?? '-';
  return (
    <div
      className="glass"
      style={{
        minWidth: 0,
        borderRadius: 16,
        padding: 9,
        border: identity.active
          ? '2px solid rgba(15, 23, 42, 0.82)'
          : '1px solid var(--glass-border)',
        boxShadow: identity.active
          ? '0 10px 24px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255,255,255,0.72)'
          : undefined,
        display: 'grid',
        gap: 7,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>
          {identity.label}
        </span>
        {identity.active && (
          <span className="pill pill--dark" style={{ padding: '2px 6px', fontSize: 9 }}>
            актив
          </span>
        )}
      </div>
      <IdentityAvatar identity={identity} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: identity.linked || identity.active ? 'var(--ink)' : 'var(--muted)',
            fontSize: 11,
            fontWeight: 900,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 3,
            color: 'var(--muted)',
            fontSize: 10,
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={subtitle}
        >
          ID {subtitle}
        </div>
      </div>
    </div>
  );
}

function IdentityAvatar({ identity }: { identity: AdminIdentity }): JSX.Element {
  const initial = identity.displayName.charAt(0).toUpperCase() || '?';
  if (identity.avatarUrl) {
    return (
      <img
        src={identity.avatarUrl}
        alt=""
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          objectFit: 'cover',
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: identity.linked || identity.active ? 'rgba(15, 23, 42, 0.92)' : 'transparent',
        border: identity.linked || identity.active ? 'none' : '1px solid rgba(15, 23, 42, 0.24)',
        color: identity.linked || identity.active ? '#ffffff' : 'var(--muted)',
        fontSize: 14,
        fontWeight: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {identity.linked || identity.active ? initial : '-'}
    </div>
  );
}

function MetaPair({
  left,
  right,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string };
}): JSX.Element {
  return (
    <section
      className="glass"
      style={{
        marginTop: 10,
        borderRadius: 16,
        padding: '10px 12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 10,
      }}
    >
      {[left, right].map((item) => (
        <div key={item.label} style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>{item.label}</div>
          <div
            style={{
              marginTop: 4,
              color: 'var(--ink)',
              fontSize: 12,
              fontWeight: 900,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={item.value}
          >
            {item.value}
          </div>
        </div>
      ))}
    </section>
  );
}

function PushNotificationCard({
  pushNotifications,
}: {
  pushNotifications: AdminUser['pushNotifications'];
}): JSX.Element {
  const enabledLabels = enabledPushTypeLabels(pushNotifications);
  return (
    <section
      className="glass"
      style={{
        marginTop: 10,
        borderRadius: 16,
        padding: 12,
        display: 'grid',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {pushNotifications.subscribed ? <Bell size={16} /> : <BellOff size={16} />}
        <div style={{ fontSize: 13, fontWeight: 950 }}>Уведомления</div>
        <span
          className={pushNotifications.subscribed ? 'pill pill--dark' : 'pill'}
          style={{ marginLeft: 'auto' }}
        >
          {pushNotifications.subscribed
            ? `${numberText(pushNotifications.subscriptionCount)} подпис.`
            : 'Выкл.'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {pushNotifications.subscribed && enabledLabels.length > 0 ? (
          enabledLabels.map((label) => (
            <span key={label} className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>
              {label}
            </span>
          ))
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 750 }}>
            {pushNotifications.subscribed
              ? 'Категории выключены в настройках профиля.'
              : 'У пользователя нет активной подписки.'}
          </span>
        )}
      </div>
    </section>
  );
}

function PurchasesCard({
  summary,
  purchases,
  expanded,
  onToggle,
}: {
  summary: AdminUserDetail['purchaseSummary'];
  purchases: AdminUserDetail['purchases'];
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const hasPurchases = purchases.length > 0;
  return (
    <section style={{ marginTop: 14 }}>
      <button
        type="button"
        className="glass"
        disabled={!hasPurchases}
        aria-expanded={hasPurchases ? expanded : undefined}
        onClick={onToggle}
        style={{
          width: '100%',
          borderRadius: 18,
          padding: 12,
          color: 'inherit',
          textAlign: 'left',
          cursor: hasPurchases ? 'pointer' : 'default',
          display: 'block',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet size={16} />
          <div style={{ fontSize: 14, fontWeight: 950 }}>Покупки</div>
          <span className="pill" style={{ marginLeft: 'auto' }}>
            {moneyText(summary.totalRubSpent)}
          </span>
          {hasPurchases && (
            <ChevronRight
              size={17}
              style={{
                transition: 'transform 140ms ease',
                transform: expanded ? 'rotate(90deg)' : 'none',
              }}
            />
          )}
        </div>
        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>
          Всего покупок: {numberText(summary.purchasesCount)}
        </div>
        {!hasPurchases && (
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
            Истории покупок пока нет.
          </div>
        )}
      </button>

      {hasPurchases && expanded && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          {purchases.map((purchase) => (
            <InfoRow
              key={purchase.id}
              label={dateText(purchase.createdAt)}
              value={`${purchase.title} · ${moneyText(purchase.amountRub)}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      className="glass"
      style={{
        borderRadius: 14,
        padding: '9px 10px',
        display: 'grid',
        gridTemplateColumns: '108px minmax(0, 1fr)',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>
      <span
        style={{
          color: 'var(--ink)',
          fontSize: 12,
          fontWeight: 800,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ConfirmAction({
  title,
  text,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div
      className="glass"
      style={{
        marginTop: 14,
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarDays size={16} />
        <div style={{ fontSize: 14, fontWeight: 950 }}>{title}</div>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.4 }}>{text}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onCancel}
          disabled={pending}
          style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}
        >
          Отмена
        </button>
        <button
          type="button"
          className="btn btn--cta"
          onClick={onConfirm}
          disabled={pending}
          style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

function ChannelPanel({
  loading,
  data,
  period,
  onPeriod,
  onChanged,
}: {
  loading: boolean;
  data: AdminChannelResponse | undefined;
  period: AdminChannelPeriod;
  onPeriod: (value: AdminChannelPeriod) => void;
  onChanged: () => void;
}): JSX.Element {
  const [editingPost, setEditingPost] = useState<AdminChannelPost | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminChannelPost | null>(null);
  const editMutation = useMutation({
    mutationFn: (input: { postId: string; content: string }) =>
      patchAdminChannelPost(input.postId, input.content),
    onSuccess: () => {
      setEditingPost(null);
      onChanged();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (postId: string) => deleteAdminChannelPost(postId),
    onSuccess: () => {
      setDeleteTarget(null);
      setEditingPost(null);
      onChanged();
    },
  });
  const summary = data?.summary;
  const statCards = [
    {
      label: 'Посты',
      value: numberText(summary?.posts ?? 0),
      hint: 'за период',
      icon: <Megaphone size={15} />,
    },
    {
      label: 'Комментарии',
      value: numberText(summary?.comments ?? 0),
      hint: `${numberText(data?.periods[0]?.commenters ?? 0)} авторов сегодня`,
      icon: <MessageSquare size={15} />,
    },
    {
      label: 'Реакции',
      value: numberText(summary?.reactions ?? 0),
      hint: `${numberText(summary?.likes ?? 0)} лайков`,
      icon: <Heart size={15} />,
    },
    {
      label: 'Вовлеченность',
      value: percentText(summary?.engagementRate ?? 0),
      hint: `${numberText(summary?.engagedUsers ?? 0)} из ${numberText(summary?.totalUsers ?? 0)}`,
      icon: <BarChart3 size={15} />,
    },
  ];

  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Новостной канал
      </div>
      <section
        className="glass"
        style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 148px', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
              {data?.channel?.name ?? 'Новости игры'}
            </div>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
              Статистика, посты и вовлеченность игроков
            </div>
          </div>
          <AdminField label="Период">
            <GlassSelect
              value={period}
              options={channelPeriodOptions}
              onChange={onPeriod}
              ariaLabel="Период аналитики канала"
            />
          </AdminField>
        </div>
      </section>
      <section
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}
      >
        {statCards.map((card) => (
          <div key={card.label} className="glass" style={{ borderRadius: 18, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)' }}>
              {card.icon}
              <span style={{ fontSize: 10, fontWeight: 900 }}>{card.label}</span>
            </div>
            <div
              style={{
                marginTop: 7,
                color: 'var(--ink)',
                fontSize: 22,
                fontWeight: 950,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {card.value}
            </div>
            <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>
              {card.hint}
            </div>
          </div>
        ))}
      </section>

      <section
        className="glass"
        style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}
      >
        <div
          style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}
        >
          <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>
            Вовлеченность по дням
          </div>
          <span className="pill" style={{ fontSize: 10 }}>
            {channelPeriodOptions.find((option) => option.value === period)?.label}
          </span>
        </div>
        {loading && <AdminPlainState>Загрузка аналитики...</AdminPlainState>}
        {!loading && (data?.periods.length ?? 0) === 0 && (
          <AdminPlainState>Данных пока нет</AdminPlainState>
        )}
        {(data?.periods ?? []).slice(0, 12).map((point) => (
          <ChannelPeriodRow key={point.periodStart} point={point} />
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          Посты ({numberText(data?.posts.length ?? 0)})
        </div>
        {loading && <AdminPlainState>Загрузка постов...</AdminPlainState>}
        {!loading && (data?.posts.length ?? 0) === 0 && (
          <AdminPlainState>Постов пока нет</AdminPlainState>
        )}
        {(data?.posts ?? []).map((post) => (
          <AdminChannelPostCard
            key={post.id}
            post={post}
            onEdit={() => setEditingPost(post)}
            onDelete={() => setDeleteTarget(post)}
          />
        ))}
      </section>

      <ChannelPostEditorSheet
        post={editingPost}
        disabled={editMutation.isPending || deleteMutation.isPending}
        deleteDisabled={deleteMutation.isPending}
        onClose={() => setEditingPost(null)}
        onSave={(postId, content) => editMutation.mutate({ postId, content })}
        onDelete={(postId) => deleteMutation.mutate(postId)}
      />
      {deleteTarget !== null && (
        <ConfirmAction
          title="Удалить пост"
          text="Пост исчезнет из новостного канала. Реакции, просмотры и комментарии останутся только в истории базы."
          confirmLabel="Удалить"
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </>
  );
}

function ChannelPeriodRow({
  point,
}: {
  point: AdminChannelResponse['periods'][number];
}): JSX.Element {
  return (
    <div
      className="glass"
      style={{
        borderRadius: 14,
        padding: '10px 11px',
        display: 'grid',
        gridTemplateColumns: '86px minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>
        {dateText(point.periodStart)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="pill" style={{ fontSize: 10 }}>
          {numberText(point.viewers)} просмотров
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          {numberText(point.comments)} комм.
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          {numberText(point.reactions)} реакц.
        </span>
      </div>
      <span className="pill pill--dark" style={{ fontSize: 10 }}>
        {percentText(point.engagementRate)}
      </span>
    </div>
  );
}

function AdminChannelPostCard({
  post,
  onEdit,
  onDelete,
}: {
  post: AdminChannelPost;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 850, lineHeight: 1.45 }}>
        <RichText text={post.content} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="pill" style={{ fontSize: 10 }}>
          Просмотры {numberText(post.viewers)}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Комментарии {numberText(post.comments)}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Реакции {numberText(post.reactionsCount)}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Лайки {numberText(post.likes)}
        </span>
      </div>
      {post.reactions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {post.reactions.map((reaction) => (
            <span key={reaction.emoji} className="pill pill--dark" style={{ fontSize: 10 }}>
              {reaction.emoji} {numberText(reaction.count)}
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 44px 44px',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
          {dateTimeText(post.createdAt)}
          {post.updatedAt !== post.createdAt ? ` · изм. ${dateTimeText(post.updatedAt)}` : ''}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onEdit}
          title="Редактировать"
          aria-label="Редактировать пост"
          style={{ width: 44, height: 44 }}
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onDelete}
          title="Удалить"
          aria-label="Удалить пост"
          style={{ width: 44, height: 44 }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function PaymentsPanel({
  loading,
  payments,
  total,
  analytics,
  search,
  onSearch,
  status,
  onStatus,
  sort,
  onSort,
  minAmount,
  onMinAmount,
  maxAmount,
  onMaxAmount,
  filtersChanged,
  onResetFilters,
}: {
  loading: boolean;
  payments: AdminPayment[];
  total: number;
  analytics:
    | {
        month: { revenueRub: number; paidCount: number };
        quarter: { revenueRub: number; paidCount: number };
        year: { revenueRub: number; paidCount: number };
      }
    | undefined;
  search: string;
  onSearch: (value: string) => void;
  status: 'all' | AdminPaymentStatus;
  onStatus: (value: 'all' | AdminPaymentStatus) => void;
  sort: AdminPaymentSort;
  onSort: (value: AdminPaymentSort) => void;
  minAmount: string;
  onMinAmount: (value: string) => void;
  maxAmount: string;
  onMaxAmount: (value: string) => void;
  filtersChanged: boolean;
  onResetFilters: () => void;
}): JSX.Element {
  const analyticsCards = [
    {
      label: 'Месяц',
      value: analytics?.month.revenueRub ?? 0,
      count: analytics?.month.paidCount ?? 0,
    },
    {
      label: 'Квартал',
      value: analytics?.quarter.revenueRub ?? 0,
      count: analytics?.quarter.paidCount ?? 0,
    },
    { label: 'Год', value: analytics?.year.revenueRub ?? 0, count: analytics?.year.paidCount ?? 0 },
  ];

  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Платежи ({numberText(total)})
      </div>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {analyticsCards.map((card) => (
          <div key={card.label} className="glass" style={{ borderRadius: 18, padding: 10 }}>
            <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{card.label}</div>
            <div style={{ marginTop: 5, color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>
              {moneyText(card.value)}
            </div>
            <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>
              {numberText(card.count)} оплат
            </div>
          </div>
        ))}
      </section>
      <section
        className="glass"
        style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}
      >
        <label
          className="glass"
          style={{
            borderRadius: 999,
            padding: '0 12px',
            height: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Search size={14} color="var(--muted)" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Игрок, товар или id платежа"
            aria-label="Поиск платежей"
            style={{
              flex: 1,
              minWidth: 0,
              width: 'auto',
              height: 'auto',
              padding: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: 'none',
            }}
          />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <AdminField label="Статус">
            <GlassSelect
              value={status}
              options={paymentStatusOptions}
              onChange={onStatus}
              ariaLabel="Фильтр по статусу платежа"
            />
          </AdminField>
          <AdminField label="Сортировка">
            <GlassSelect
              value={sort}
              options={paymentSortOptions}
              onChange={onSort}
              ariaLabel="Сортировка платежей"
            />
          </AdminField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
          <AdminField label="Цена от">
            <input
              type="number"
              value={minAmount}
              onChange={(event) => onMinAmount(event.target.value)}
            />
          </AdminField>
          <AdminField label="Цена до">
            <input
              type="number"
              value={maxAmount}
              onChange={(event) => onMaxAmount(event.target.value)}
            />
          </AdminField>
          <button
            type="button"
            className="icon-btn"
            onClick={onResetFilters}
            disabled={!filtersChanged}
            aria-label="Сбросить фильтры платежей"
            title="Сбросить"
            style={{ width: 44, height: 44, alignSelf: 'end', opacity: filtersChanged ? 1 : 0.5 }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <AdminPlainState>Загрузка платежей...</AdminPlainState>}
        {!loading && payments.length === 0 && <AdminPlainState>Платежей пока нет</AdminPlainState>}
        {payments.map((payment) => (
          <PaymentCard key={payment.id} payment={payment} />
        ))}
      </section>
    </>
  );
}

function PaymentCard({ payment }: { payment: AdminPayment }): JSX.Element {
  return (
    <article
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 10,
        alignItems: 'start',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>{payment.title}</div>
        <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
          {payment.userDisplayName} · {dateText(payment.createdAt)}
        </div>
        <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 10, fontWeight: 750 }}>
          {payment.provider}
          {payment.providerPaymentId ? ` · ${payment.providerPaymentId}` : ''}
        </div>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
        <span className="pill pill--dark">{moneyText(payment.amountRub)}</span>
        <span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>
          {paymentStatusLabel(payment.status)}
        </span>
      </div>
    </article>
  );
}

function FeedbackPanel({
  loading,
  feedback,
  total,
  unreadCount,
  status,
  onStatus,
  kind,
  onKind,
  onChanged,
}: {
  loading: boolean;
  feedback: AdminFeedback[];
  total: number;
  unreadCount: number;
  status: AdminFeedbackStatus;
  onStatus: (value: AdminFeedbackStatus) => void;
  kind: 'all' | AdminFeedbackKind;
  onKind: (value: 'all' | AdminFeedbackKind) => void;
  onChanged: () => void;
}): JSX.Element {
  const markMutation = useMutation({
    mutationFn: (input: { id: string; isRead: boolean }) =>
      patchAdminFeedback(input.id, input.isRead),
    onSuccess: onChanged,
  });

  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Обратная связь ({numberText(total)})
      </div>
      <section
        className="glass"
        style={{
          borderRadius: 18,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <div
          className="glass"
          style={{
            gridColumn: '1 / -1',
            borderRadius: 16,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 850 }}>
            Непрочитанные
          </span>
          <span
            style={{
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono)',
              fontSize: 24,
              fontWeight: 900,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {numberText(unreadCount)}
          </span>
        </div>
        <AdminField label="Статус">
          <GlassSelect
            value={status}
            options={feedbackStatusOptions}
            onChange={onStatus}
            ariaLabel="Фильтр обратной связи по статусу"
          />
        </AdminField>
        <AdminField label="Тип">
          <GlassSelect
            value={kind}
            options={feedbackKindOptions}
            onChange={onKind}
            ariaLabel="Фильтр обратной связи по типу"
          />
        </AdminField>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <AdminPlainState>Загрузка сообщений...</AdminPlainState>}
        {!loading && feedback.length === 0 && <AdminPlainState>Сообщений пока нет</AdminPlainState>}
        {feedback.map((item) => (
          <FeedbackCard
            key={item.id}
            item={item}
            pending={markMutation.isPending}
            onToggleRead={() => markMutation.mutate({ id: item.id, isRead: !item.isRead })}
          />
        ))}
      </section>
    </>
  );
}

function FeedbackCard({
  item,
  pending,
  onToggleRead,
}: {
  item: AdminFeedback;
  pending: boolean;
  onToggleRead: () => void;
}): JSX.Element {
  return (
    <article
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gap: 10,
        border: item.isRead ? '1px solid var(--glass-border)' : '1px solid rgba(15, 23, 42, 0.46)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className={item.isRead ? 'pill' : 'pill pill--dark'} style={{ fontSize: 10 }}>
              {item.isRead ? 'Прочитано' : 'Новое'}
            </span>
            <span className="pill" style={{ fontSize: 10 }}>
              {feedbackKindLabel(item.kind)}
            </span>
            {item.kind === 'review' && item.rating !== null && (
              <span
                className="pill"
                style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Star size={11} fill="currentColor" />
                {item.rating}/5
              </span>
            )}
          </div>
          <div
            style={{
              marginTop: 8,
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 900,
              overflowWrap: 'anywhere',
            }}
          >
            {item.userDisplayName}
          </div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
            {dateTimeText(item.createdAt)}
            {item.readAt ? ` · прочитал ${item.readByDisplayName ?? 'админ'}` : ''}
          </div>
        </div>
        <button
          type="button"
          className={item.isRead ? 'btn btn--ghost' : 'btn btn--cta'}
          disabled={pending}
          onClick={onToggleRead}
          style={{
            minHeight: 38,
            padding: '0 12px',
            borderRadius: 13,
            fontSize: 11,
            letterSpacing: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <CheckCircle size={14} />
          {item.isRead ? 'В непрочитанные' : 'Прочитано'}
        </button>
      </div>
      <div
        style={{
          color: 'rgba(15, 23, 42, 0.76)',
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {item.message}
      </div>
    </article>
  );
}

function InventoryPanel({
  loading,
  items,
  onChanged,
}: {
  loading: boolean;
  items: AdminInventoryItem[];
  onChanged: () => void;
}): JSX.Element {
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminInventoryItem | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteAdminInventoryItem(itemId),
    onSuccess: () => {
      setDeleteTarget(null);
      onChanged();
    },
  });

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          Инвентарь ({numberText(items.length)})
        </div>
        <button
          type="button"
          className="chip chip--active"
          onClick={() => setEditingItem('new')}
          style={{ padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
          <Plus size={14} />
          Создать
        </button>
      </div>
      {editingItem !== null && (
        <InventoryEditor
          item={editingItem === 'new' ? null : editingItem}
          onCancel={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            onChanged();
          }}
        />
      )}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <AdminPlainState>Загрузка инвентаря...</AdminPlainState>}
        {!loading && items.length === 0 && <AdminPlainState>Предметов пока нет</AdminPlainState>}
        {items.map((item) => (
          <InventoryItemCard
            key={item.id}
            item={item}
            onEdit={() => setEditingItem(item)}
            onDelete={() => setDeleteTarget(item)}
          />
        ))}
      </section>
      {deleteTarget !== null && (
        <ConfirmAction
          title="Удалить предмет"
          text={`Предмет “${deleteTarget.title}” исчезнет из активного списка инвентаря. История платежей сохранится.`}
          confirmLabel="Удалить"
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </>
  );
}

function InventoryItemCard({
  item,
  onEdit,
  onDelete,
}: {
  item: AdminInventoryItem;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <article
      className="glass"
      style={{
        borderRadius: 18,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: '56px minmax(0, 1fr)',
        gap: 10,
      }}
    >
      <InventoryThumb item={item} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>{item.title}</div>
            <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>
              {item.description || 'Без описания'}
            </div>
          </div>
          <span className="pill pill--dark" style={{ alignSelf: 'start' }}>
            {moneyText(item.priceRub)}
          </span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>
            Покупок {numberText(item.paymentsCount)}
          </span>
          <span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>
            Выручка {moneyText(item.paidRevenueRub)}
          </span>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onEdit}
            style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}
          >
            <Pencil size={14} />
            Редактировать
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onDelete}
            title="Удалить"
            aria-label={`Удалить ${item.title}`}
            style={{ width: 44, height: 44 }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

function InventoryThumb({ item }: { item: AdminInventoryItem }): JSX.Element {
  if (item.photoUrl) {
    return (
      <img
        src={item.photoUrl}
        alt=""
        style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: 'rgba(15, 23, 42, 0.9)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Package size={20} />
    </div>
  );
}

function InventoryEditor({
  item,
  onCancel,
  onSaved,
}: {
  item: AdminInventoryItem | null;
  onCancel: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [photoUrl, setPhotoUrl] = useState(item?.photoUrl ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priceRub, setPriceRub] = useState(item ? String(item.priceRub) : '');
  const mutation = useMutation({
    mutationFn: () => {
      const body: Required<AdminInventoryItemPatch> = {
        photoUrl,
        title,
        description,
        priceRub: Number(priceRub),
      };
      return item === null
        ? createAdminInventoryItem(body)
        : patchAdminInventoryItem(item.id, body);
    },
    onSuccess: onSaved,
  });
  const canSave = title.trim() !== '' && Number.isFinite(Number(priceRub)) && Number(priceRub) >= 0;

  return (
    <section className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
        {item === null ? 'Новый предмет' : 'Редактирование предмета'}
      </div>
      <AdminField label="Фото URL">
        <input value={photoUrl} onChange={(event) => setPhotoUrl(event.target.value)} />
      </AdminField>
      <AdminField label="Название">
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </AdminField>
      <AdminField label="Описание">
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </AdminField>
      <AdminField label="Цена">
        <input
          type="number"
          value={priceRub}
          onChange={(event) => setPriceRub(event.target.value)}
        />
      </AdminField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onCancel}
          style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}
        >
          Отмена
        </button>
        <button
          type="button"
          className="btn btn--cta"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !canSave}
          style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}
        >
          <Save size={14} />
          Сохранить
        </button>
      </div>
      {mutation.isError && (
        <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
          {mutation.error instanceof Error ? mutation.error.message : 'Ошибка сохранения'}
        </div>
      )}
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
  const [sectionId, setSectionId] = useState<SettingsSectionId | null>(null);
  const activeSection = settingSections.find((section) => section.id === sectionId) ?? null;
  const sectionSettings =
    activeSection === null
      ? []
      : settings.filter(
          (setting) =>
            setting.key.startsWith(`${activeSection.id}.`) && !isHiddenGameSetting(setting),
        );

  if (activeSection !== null) {
    return (
      <>
        <button
          type="button"
          className="chip"
          onClick={() => setSectionId(null)}
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
          }}
        >
          <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} />
          Назад
        </button>
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          {activeSection.number}. {activeSection.title}
        </div>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && <AdminPlainState>Загрузка...</AdminPlainState>}
          {!loading && sectionSettings.length === 0 && (
            <AdminPlainState>
              <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>
                Параметров пока нет
              </div>
              <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>
                Этот раздел подключим позже.
              </div>
            </AdminPlainState>
          )}
          {activeSection.id === 'daily' ? (
            <DailySettings settings={sectionSettings} onSaved={onSaved} />
          ) : (
            sectionSettings.map((setting) => (
              <SettingEditor key={setting.key} setting={setting} onSaved={onSaved} />
            ))
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Параметры
      </div>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {settingSections.map((section) => {
          const count = settings.filter(
            (setting) => setting.key.startsWith(`${section.id}.`) && !isHiddenGameSetting(setting),
          ).length;
          return (
            <button
              key={section.id}
              type="button"
              className="glass"
              onClick={() => setSectionId(section.id)}
              style={{
                minHeight: 120,
                borderRadius: 20,
                padding: 14,
                color: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateRows: 'auto minmax(0, 1fr) auto',
                gap: 12,
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    background: 'rgba(15, 23, 42, 0.92)',
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 950,
                  }}
                >
                  {section.number}
                </span>
                <span className="pill" style={{ padding: 7 }}>
                  {section.icon}
                </span>
              </div>
              <div
                style={{
                  color: 'var(--ink)',
                  fontSize: 16,
                  lineHeight: 1.12,
                  fontWeight: 950,
                }}
              >
                {section.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
                  {count > 0
                    ? `${count} параметр${count === 1 ? '' : count < 5 ? 'а' : 'ов'}`
                    : 'Пока пусто'}
                </span>
                <ChevronRight size={16} color="var(--muted)" style={{ marginLeft: 'auto' }} />
              </div>
            </button>
          );
        })}
        {loading && <AdminPlainState style={{ gridColumn: '1 / -1' }}>Загрузка...</AdminPlainState>}
      </section>
    </>
  );
}

function DailySettings({
  settings,
  onSaved,
}: {
  settings: AdminGameSetting[];
  onSaved: () => void;
}): JSX.Element {
  const [openPeriods, setOpenPeriods] = useState<ReadonlySet<1 | 2 | 3>>(() => new Set());
  const baseSettings = settings.filter((setting) => dailySpeedPeriod(setting) === null);
  const speedGroups = ([1, 2, 3] as const).map((periodNumber) => ({
    periodNumber,
    settings: settings.filter((setting) => dailySpeedPeriod(setting) === periodNumber),
  }));

  function togglePeriod(periodNumber: 1 | 2 | 3): void {
    setOpenPeriods((current) => {
      const next = new Set(current);
      if (next.has(periodNumber)) next.delete(periodNumber);
      else next.add(periodNumber);
      return next;
    });
  }

  return (
    <>
      {baseSettings.map((setting) => (
        <SettingEditor key={setting.key} setting={setting} onSaved={onSaved} />
      ))}
      {speedGroups.map((group) =>
        group.settings.length > 0 ? (
          <PeriodSpeedSettings
            key={group.periodNumber}
            periodNumber={group.periodNumber}
            settings={group.settings}
            open={openPeriods.has(group.periodNumber)}
            onToggle={() => togglePeriod(group.periodNumber)}
            onSaved={onSaved}
          />
        ) : null,
      )}
    </>
  );
}

function PeriodSpeedSettings({
  periodNumber,
  settings,
  open,
  onToggle,
  onSaved,
}: {
  periodNumber: 1 | 2 | 3;
  settings: AdminGameSetting[];
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}): JSX.Element {
  const summary = settings
    .map((setting) => `${setting.label.replace('Скорость ', '')} ${setting.value}`)
    .join(' · ');

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0 }}>
      <button
        type="button"
        className="glass"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          borderRadius: 20,
          padding: '14px 16px',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          outline: 'none',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              color: 'var(--ink)',
              fontSize: 15,
              fontWeight: 950,
            }}
          >
            Скорости {periodNumber}-го периода
          </span>
          <span
            style={{
              display: 'block',
              marginTop: 5,
              color: 'var(--muted)',
              fontSize: 11,
              fontWeight: 800,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary}
          </span>
        </span>
        <span
          className="pill"
          style={{
            width: 38,
            height: 38,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight
            size={18}
            style={{
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 140ms ease-out',
            }}
          />
        </span>
      </button>
      {open &&
        settings.map((setting) => (
          <SettingEditor key={setting.key} setting={setting} onSaved={onSaved} />
        ))}
    </section>
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
  const numberValue = Number(value);
  const parsedValue = useMemo<GameSettingValue>(() => {
    if (setting.type === 'number') return numberValue;
    return value;
  }, [setting.type, numberValue, value]);
  const dirty = value !== String(setting.value);
  const valid = setting.type !== 'number' || Number.isFinite(numberValue);

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
            {setting.description}
          </div>
        </div>
        <span className="pill" style={{ alignSelf: 'flex-start' }}>
          {settingValueText(setting, setting.defaultValue)}
        </span>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8 }}>
        {setting.type === 'select' ? (
          <GlassSelect
            value={value}
            options={setting.options ?? []}
            onChange={setValue}
            ariaLabel={setting.label}
          />
        ) : (
          <input
            type="number"
            value={value}
            inputMode={setting.step !== undefined && setting.step < 1 ? 'decimal' : 'numeric'}
            onChange={(event) => setValue(event.target.value)}
            min={setting.min}
            max={setting.max}
            step={setting.step ?? 1}
          />
        )}
        <button
          type="button"
          className="icon-btn icon-btn--dark"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !dirty || !valid}
          title="Сохранить"
          aria-label={`Сохранить ${setting.label}`}
          style={{
            width: 44,
            height: 44,
            opacity: dirty && valid ? 1 : 0.52,
            cursor: dirty && valid ? 'pointer' : 'not-allowed',
          }}
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
    <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>
      {children}
    </div>
  );
}
