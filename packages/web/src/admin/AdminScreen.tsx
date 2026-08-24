import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  BellOff,
  CalendarDays,
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
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import { rewardColor } from '../app/rewardColors.js';
import { useAuthStore } from '../auth/authStore.js';
import { ChannelPostEditorSheet } from '../chat/components/ChannelPostEditorSheet.js';
import { RichText } from '../chat/richText.js';
import { GlassSelect, type GlassSelectOption } from '../components/GlassSelect.js';
import { ADMIN_NAV_HOME_EVENT } from '../components/BottomNav.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { convertChatAvatarToWebp } from '../lib/chatAvatarImage.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { AchievementDetailsSheet, AchievementTile } from '../screens/profileSections.js';
import { WeeklyChallengesAdmin } from './WeeklyChallengesAdmin.js';
import { BonusGamesAdmin } from './BonusGamesAdmin.js';
import {
  createAdminInventoryItem,
  createAdminDuelTemplate,
  deleteAdminDuelTemplate,
  deleteAdminChannelPost,
  deleteAdminInventoryItem,
  fetchAdminChannelNews,
  fetchAdminDuelHistory,
  fetchAdminDuelTemplates,
  fetchAdminFeedback,
  fetchAdminGameSettings,
  fetchAdminAchievements,
  fetchAdminInventory,
  fetchAdminMismatches,
  fetchAdminNotifications,
  fetchAdminPayments,
  fetchAdminPushMonitoring,
  fetchAdminSummary,
  fetchAdminUser,
  fetchAdminUsers,
  patchAdminChannelPost,
  patchAdminChatProfile,
  resetAdminChatAvatar,
  patchAdminFeedback,
  patchAdminDuelTemplate,
  patchAdminInventoryGameplay,
  patchAdminInventoryItem,
  patchAdminAchievement,
  patchAdminGameSetting,
  patchAdminNotification,
  patchAdminUser,
  uploadAdminChatAvatar,
  type AdminDashboard,
  type AdminDashboardPeriod,
  type AdminDashboardSeriesPoint,
  type AdminAchievement,
  type AdminAchievementAvailability,
  type AdminAchievementCategory,
  type AdminAchievementFutureTag,
  type AdminAchievementPatch,
  type AdminDuelHistoryItem,
  type AdminDuelHistoryResponse,
  type AdminDuelPeriodSpeedPreset,
  type AdminDuelTemplate,
  type AdminDuelTemplateInput,
  type AdminChannelPeriod,
  type AdminChannelPost,
  type AdminChannelResponse,
  type AdminFeedback,
  type AdminFeedbackKind,
  type AdminFeedbackQuery,
  type AdminGameSetting,
  type AdminInventoryItem,
  type AdminInventoryGameplayPatch,
  type AdminInventoryItemKind,
  type AdminInventoryItemPatch,
  type AdminInventoryResourceUnit,
  type AdminMismatchLog,
  type AdminMismatchPeriod,
  type AdminMatchmakingVenuePolicy,
  type AdminMismatchesResponse,
  type AdminNotificationStats,
  type AdminPushNotification,
  type AdminPushNotificationCategory,
  type AdminPushNotificationKey,
  type AdminPushNotificationPatch,
  type AdminPushMonitoringResponse,
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
  | 'notifications'
  | 'channel'
  | 'anticheat'
  | 'payments'
  | 'inventory'
  | 'achievements'
  | 'bonus-games'
  | 'duels'
  | 'feedback'
  | 'settings';
type AdminAchievementsTab = 'achievements' | 'challenges';
type SortField = 'name' | 'goals' | 'accuracy';
type SortDirection = 'asc' | 'desc';
type AdminIdentity = AdminUser['identities'][number];
type AdminUserAchievement = AdminUserDetail['achievements'][number];
type SettingsSectionId = 'daily' | 'training' | 'amateur' | 'pro';
type AdminFeedbackStatus = AdminFeedbackQuery['status'];

const tabs: Array<{ id: AdminTab; label: string; icon: JSX.Element }> = [
  { id: 'dashboard', label: 'Дашборд', icon: <BarChart3 size={15} /> },
  { id: 'users', label: 'Игроки', icon: <Users size={15} /> },
  { id: 'notifications', label: 'Уведомления', icon: <Bell size={15} /> },
  { id: 'channel', label: 'Канал', icon: <Megaphone size={15} /> },
  { id: 'anticheat', label: 'Античит', icon: <ShieldAlert size={15} /> },
  { id: 'payments', label: 'Платежи', icon: <CreditCard size={15} /> },
  { id: 'inventory', label: 'Инвентарь', icon: <Package size={15} /> },
  { id: 'achievements', label: 'Задания', icon: <Medal size={15} /> },
  { id: 'bonus-games', label: 'Бонусные игры', icon: <Gamepad2 size={15} /> },
  { id: 'duels', label: 'Дуэли', icon: <Trophy size={15} /> },
  { id: 'feedback', label: 'Отзывы', icon: <MessageSquare size={15} /> },
  { id: 'settings', label: 'Параметры', icon: <SlidersHorizontal size={15} /> },
];

const channelPeriodOptions: Array<GlassSelectOption<AdminChannelPeriod>> = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

const dashboardPeriodOptions: Array<GlassSelectOption<AdminDashboardPeriod>> = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
  { value: '365d', label: '1 год' },
];

const venueOptions = [
  { value: 'neutral_default', label: 'Нейтральная стандартная' },
  { value: 'random_participant_home', label: 'Случайный хозяин' },
  { value: 'random_unselected', label: 'Случайная нейтральная' },
] as const satisfies ReadonlyArray<GlassSelectOption<AdminMatchmakingVenuePolicy>>;
const venueSelectOptions: Array<GlassSelectOption<AdminMatchmakingVenuePolicy>> = venueOptions.map(
  (option) => ({ ...option }),
);

const adminAchievementsTabs: Array<{ id: AdminAchievementsTab; label: string }> = [
  { id: 'achievements', label: 'Задания' },
  { id: 'challenges', label: 'Челленджи' },
];

const pushNotificationStatusOptions: Array<GlassSelectOption<'enabled' | 'disabled'>> = [
  { value: 'enabled', label: 'Включено' },
  { value: 'disabled', label: 'Отключено' },
];

const pushNotificationCategoryLabels: Record<AdminPushNotificationCategory, string> = {
  chat: 'Чат',
  daily: 'Ежедневная игра',
  training: 'Тренировка',
  duel: 'Дуэли',
  news: 'Новости',
};

const pushDeliveryStatusLabels: Record<
  AdminPushMonitoringResponse['byStatus'][number]['status'],
  string
> = {
  queued: 'Очередь',
  processing: 'В работе',
  sent: 'Доставлено',
  partial: 'Частично',
  failed: 'Ошибка',
  skipped: 'Пропущено',
};

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

const inventoryItemKindOptions: Array<GlassSelectOption<AdminInventoryItemKind>> = [
  { value: 'bundle', label: 'Набор' },
  { value: 'stick', label: 'Клюшка' },
  { value: 'skates', label: 'Коньки' },
  { value: 'nutrition', label: 'Энергия' },
  { value: 'consumable', label: 'Расходник' },
];

const achievementCategoryOptions: Array<GlassSelectOption<AdminAchievementCategory>> = [
  { value: 'daily', label: 'Ежедневная' },
  { value: 'training', label: 'Тренировка' },
  { value: 'duel', label: 'Дуэли' },
  { value: 'tournament', label: 'Турниры' },
  { value: 'shop', label: 'Магазин' },
  { value: 'rating', label: 'Рейтинг' },
  { value: 'level', label: 'Уровни' },
];

const achievementAvailabilityOptions: Array<GlassSelectOption<AdminAchievementAvailability>> = [
  { value: 'active', label: 'Активно' },
  { value: 'future', label: 'Будущее' },
  { value: 'hidden', label: 'Скрыто' },
];

const achievementFutureTagOptions: Array<GlassSelectOption<AdminAchievementFutureTag | 'none'>> = [
  { value: 'none', label: 'Без метки' },
  { value: 'future/pro', label: 'future/pro' },
  { value: 'future/tournament', label: 'future/tournament' },
  { value: 'future/monthly_rating', label: 'future/monthly_rating' },
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
  { key: 'duelEvents', label: 'Дуэли', shortLabel: 'Дуэли' },
  { key: 'gameNews', label: 'Новости игры', shortLabel: 'Новости' },
];

function toAdminSort(field: SortField, direction: SortDirection): AdminSort {
  return `${field}_${direction}` as AdminSort;
}

function dashboardPeriodLabel(period: AdminDashboardPeriod): string {
  return dashboardPeriodOptions.find((option) => option.value === period)?.label ?? '30 дней';
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function compactNumberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
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

function compactMoneyText(value: number): string {
  return `${compactNumberText(value)} ₽`;
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

function inventoryItemKindLabel(kind: AdminInventoryItemKind): string {
  return inventoryItemKindOptions.find((option) => option.value === kind)?.label ?? kind;
}

function msToMinutes(value: number): number {
  return Math.round(value / 60_000);
}

function minutesToMs(value: string): number {
  return Math.max(0, Math.round(parseAdminNumberInput(value) * 60_000));
}

function parseAdminNumberInput(value: string | number): number {
  if (typeof value === 'number') return value;
  return Number(value.trim().replace(',', '.'));
}

function parseAdminIntegerInput(value: string | number): number {
  const numeric = parseAdminNumberInput(value);
  return Number.isInteger(numeric) ? numeric : Number.NaN;
}

function gameModeLabel(mode: string | null | undefined): string {
  if (mode === 'daily') return 'Ежедневная игра';
  if (mode === 'training') return 'Тренировка';
  if (mode === 'story') return 'Сюжет';
  return mode || '-';
}

function shotResultLabel(result: string | null | undefined): string {
  if (result === 'goal') return 'Гол';
  if (result === 'save') return 'Сейв';
  if (result === 'miss') return 'Мимо';
  return result || '-';
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

function dateTimeInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function fieldNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function inventoryChargeFieldValue(item: AdminInventoryItem | null): string {
  if (!item) return '1';
  if (item.itemKind === 'nutrition') return String(Math.ceil(item.chargesPerPurchase / 60_000));
  return fieldNumber(item.chargesPerPurchase);
}

function inventoryChargeValueForSave(kind: AdminInventoryItemKind, value: number): number {
  return kind === 'nutrition' ? Math.max(0, Math.round(value * 60_000)) : Math.round(value);
}

function inventoryLowStockDefault(kind: AdminInventoryItemKind): number {
  if (kind === 'stick') return 10;
  if (kind === 'skates') return 50;
  if (kind === 'nutrition') return 60_000;
  return 0;
}

function puckSpeedDeltaToPoints(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(Math.round(value * 100));
}

function puckSpeedPointsFieldValue(item: AdminInventoryItem | null): string {
  if (!item) return '0';
  if (Number.isFinite(item.effectPuckSpeedPoints) && item.effectPuckSpeedPoints !== 0) {
    return fieldNumber(item.effectPuckSpeedPoints);
  }
  return puckSpeedDeltaToPoints(item.effectPuckSpeedDelta ?? 0);
}

function puckSpeedPointsToDelta(value: string): number {
  return parseAdminNumberInput(value) / 100;
}

function inventoryResourceUnitForKind(kind: AdminInventoryItemKind): AdminInventoryResourceUnit {
  if (kind === 'stick') return 'shot';
  if (kind === 'skates') return 'distance';
  if (kind === 'nutrition') return 'energy_ms';
  return 'period';
}

const adminInventoryHintStyle: CSSProperties = {
  color: 'rgba(71, 85, 105, 0.78)',
  fontSize: 9.5,
  fontWeight: 500,
  lineHeight: 1.18,
};

const adminInventoryFieldBodyStyle: CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 6,
};

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

function AdminMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 10, boxShadow: 'none' }}>
      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>{label}</div>
      <div style={{ marginTop: 3, color: 'var(--ink)', fontSize: 17, fontWeight: 950 }}>
        {numberText(value)}
      </div>
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

function secondsAgeText(value: number): string {
  if (value <= 0) return 'нет';
  return minutesText(Math.ceil(value / 60));
}

function shortDateText(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso.slice(5);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(date);
}

function niceChartMax(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
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
  const [dashboardPeriod, setDashboardPeriod] = useState<AdminDashboardPeriod>('30d');
  const [mismatchPeriod, setMismatchPeriod] = useState<AdminMismatchPeriod>('30d');
  const [channelPeriod, setChannelPeriod] = useState<AdminChannelPeriod>('30d');

  useEffect(() => {
    const resetToDashboard = (): void => {
      setTab('dashboard');
    };
    window.addEventListener(ADMIN_NAV_HOME_EVENT, resetToDashboard);
    return () => window.removeEventListener(ADMIN_NAV_HOME_EVENT, resetToDashboard);
  }, []);
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
    queryKey: ['admin', 'summary', dashboardPeriod],
    queryFn: () => fetchAdminSummary(dashboardPeriod),
    enabled: canTryAdmin && tab === 'dashboard',
  });
  const settings = useQuery({
    queryKey: ['admin', 'game-settings'],
    queryFn: fetchAdminGameSettings,
    enabled: canTryAdmin && tab === 'settings',
  });
  const achievements = useQuery({
    queryKey: ['admin', 'achievements'],
    queryFn: fetchAdminAchievements,
    enabled: canTryAdmin && tab === 'achievements',
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
  const mismatches = useQuery({
    queryKey: ['admin', 'mismatches', mismatchPeriod],
    queryFn: () => fetchAdminMismatches(mismatchPeriod),
    enabled: canTryAdmin && tab === 'anticheat',
  });
  const notifications = useQuery({
    queryKey: ['admin', 'notifications'],
    queryFn: fetchAdminNotifications,
    enabled: canTryAdmin && tab === 'notifications',
  });
  const pushMonitoring = useQuery({
    queryKey: ['admin', 'push-monitoring'],
    queryFn: fetchAdminPushMonitoring,
    enabled: canTryAdmin && tab === 'notifications',
    refetchInterval: tab === 'notifications' ? 30_000 : false,
  });
  const channel = useQuery({
    queryKey: ['admin', 'channel', channelPeriod],
    queryFn: () => fetchAdminChannelNews(channelPeriod),
    enabled: canTryAdmin && tab === 'channel',
  });
  const inventory = useQuery({
    queryKey: ['admin', 'inventory'],
    queryFn: fetchAdminInventory,
    enabled: canTryAdmin && (tab === 'inventory' || tab === 'duels'),
  });
  const duelTemplates = useQuery({
    queryKey: ['admin', 'duel-templates'],
    queryFn: fetchAdminDuelTemplates,
    enabled: canTryAdmin && tab === 'duels',
  });

  const denied =
    user?.role === 'player' ||
    [
      users.error,
      summary.error,
      settings.error,
      achievements.error,
      payments.error,
      inventory.error,
      duelTemplates.error,
      feedback.error,
      mismatches.error,
      notifications.error,
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
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        padding: 'calc(14px + var(--app-safe-top)) 14px 18px',
        gap: 12,
      }}
    >
      <nav
        className="glass no-scrollbar"
        style={{
          borderRadius: 999,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          minHeight: 52,
          flex: '0 0 auto',
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          gap: 4,
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
              minWidth: 112,
              height: 42,
            }}
          >
            {item.id === 'feedback' ? `${item.label} (${feedbackUnreadCount})` : item.label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && (
        <DashboardPanel
          loading={summary.isLoading}
          dashboard={summary.data?.dashboard ?? null}
          period={dashboardPeriod}
          onPeriod={setDashboardPeriod}
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
      {tab === 'notifications' && (
        <NotificationsPanel
          loading={notifications.isLoading}
          notifications={notifications.data?.notifications ?? []}
          monitoring={pushMonitoring.data ?? null}
          monitoringLoading={pushMonitoring.isLoading}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
            void queryClient.invalidateQueries({ queryKey: ['admin', 'push-monitoring'] });
          }}
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
      {tab === 'anticheat' && (
        <AnticheatPanel
          loading={mismatches.isLoading}
          data={mismatches.data}
          period={mismatchPeriod}
          onPeriod={setMismatchPeriod}
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
      {tab === 'achievements' && (
        <AchievementsAdminPanel
          loading={achievements.isLoading}
          achievements={achievements.data?.achievements ?? []}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'achievements'] });
            void queryClient.invalidateQueries({ queryKey: ['achievements'] });
          }}
        />
      )}
      {tab === 'bonus-games' && <BonusGamesAdmin />}
      {tab === 'duels' && (
        <DuelTemplatesPanel
          loading={duelTemplates.isLoading}
          templates={duelTemplates.data?.templates ?? []}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin', 'duel-templates'] });
          }}
        />
      )}
      {tab === 'feedback' && (
        <FeedbackPanel
          loading={feedback.isLoading}
          feedback={feedback.data?.feedback ?? []}
          total={feedback.data?.total ?? 0}
          unreadCount={feedbackUnreadCount}
          ratingStats={feedback.data?.ratingStats ?? { count: 0, average: null }}
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
  period,
  onPeriod,
}: {
  loading: boolean;
  dashboard: AdminDashboard | null;
  period: AdminDashboardPeriod;
  onPeriod: (period: AdminDashboardPeriod) => void;
}): JSX.Element {
  const periodLabel = dashboardPeriodLabel(dashboard?.period ?? period);
  const header = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 126px',
        gap: 8,
        alignItems: 'center',
        margin: '2px 0 -4px 0',
      }}
    >
      <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
        Дашборд
      </div>
      <GlassSelect
        value={period}
        options={dashboardPeriodOptions}
        onChange={onPeriod}
        ariaLabel="Период дашборда"
      />
    </div>
  );

  if (loading || dashboard === null) {
    return (
      <>
        {header}
        <AdminPlainState>Собираем цифры проекта...</AdminPlainState>
      </>
    );
  }

  return (
    <>
      {header}
      <DashboardHero dashboard={dashboard} periodLabel={periodLabel} />
      <DashboardMetricGrid dashboard={dashboard} periodLabel={periodLabel} />
      <UserNotificationStats stats={dashboard.notifications} loading={false} />
      <DashboardChartCard
        title="Активные пользователи"
        subtitle={periodLabel}
        series={dashboard.series}
        valueKey="activeUsers"
        color="#1d4ed8"
      />
      <DashboardChartCard
        title="Новые пользователи"
        subtitle={periodLabel}
        series={dashboard.series}
        valueKey="newUsers"
        color="#0f766e"
      />
      <DashboardChartCard
        title="Выручка"
        subtitle={periodLabel}
        series={dashboard.series}
        valueKey="revenueRub"
        color="#7c2d12"
        formatValue={moneyText}
        formatAxisValue={compactMoneyText}
      />
      <DashboardChartCard
        title="Броски"
        subtitle={periodLabel}
        series={dashboard.series}
        valueKey="shots"
        color="#4338ca"
      />
      <DashboardChartCard
        title="Сообщения"
        subtitle={periodLabel}
        series={dashboard.series}
        valueKey="messages"
        color="#047857"
      />
    </>
  );
}

function DashboardHero({
  dashboard,
  periodLabel,
}: {
  dashboard: AdminDashboard;
  periodLabel: string;
}): JSX.Element {
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
          <div style={{ color: 'var(--ink)', fontSize: 19, fontWeight: 950 }}>Ультимейт Хоккей</div>
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
          label="Выручка"
          value={moneyText(dashboard.payments.revenuePeriodRub)}
          note={`${periodLabel} · год ${moneyText(dashboard.payments.revenueYearRub)}`}
        />
        <DashboardMiniStat
          label="Точность"
          value={percentText(dashboard.game.accuracyPeriod)}
          note={`${numberText(dashboard.game.goalsPeriod)} голов · ${periodLabel}`}
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

function DashboardMetricGrid({
  dashboard,
  periodLabel,
}: {
  dashboard: AdminDashboard;
  periodLabel: string;
}): JSX.Element {
  const cards = [
    {
      label: 'Всего игроков',
      value: numberText(dashboard.users.total),
      note: `+${numberText(dashboard.users.newInPeriod)} за ${periodLabel}`,
    },
    {
      label: 'Активные',
      value: numberText(dashboard.users.activeInPeriod),
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
      label: 'ARPU',
      value: moneyText(dashboard.payments.arpuPeriodRub),
      note: `${periodLabel} · ARPPU ${moneyText(dashboard.payments.arppuPeriodRub)}`,
    },
    {
      label: 'Броски',
      value: numberText(dashboard.game.shotsPeriod),
      note: `${numberText(dashboard.game.dailyPlayersPeriod)} дневная · ${numberText(dashboard.game.trainingPlayersPeriod)} тренировка`,
    },
    {
      label: 'Броски всего',
      value: numberText(dashboard.game.shotsTotal),
      note: `${numberText(dashboard.game.goalsTotal)} голов`,
    },
    {
      label: 'Чат',
      value: numberText(dashboard.chat.messagesPeriod),
      note: `${numberText(dashboard.chat.activeUsersPeriod)} авторов за ${periodLabel}`,
    },
    {
      label: 'Фидбек',
      value: numberText(dashboard.feedback.unread),
      note: `${numberText(dashboard.feedback.total)} всего`,
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
  formatAxisValue = compactNumberText,
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
  formatAxisValue?: (value: number) => string;
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
      <MiniLineChart
        series={series}
        values={values}
        color={color}
        formatValue={formatValue}
        formatAxisValue={formatAxisValue}
        ariaLabel={`График ${title.toLowerCase()} за ${subtitle}`}
      />
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
  formatValue,
  formatAxisValue,
  ariaLabel,
}: {
  series: AdminDashboardSeriesPoint[];
  values: number[];
  color: string;
  formatValue: (value: number) => string;
  formatAxisValue: (value: number) => string;
  ariaLabel: string;
}): JSX.Element {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 344;
  const height = 154;
  const chartLeft = 58;
  const chartRight = width - 10;
  const chartTop = 18;
  const chartBottom = height - 24;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const peak = Math.max(0, ...values);
  const max = niceChartMax(peak);
  const tickValues =
    peak > 0
      ? [max, Math.round((max * 2) / 3), Math.round(max / 3), 0].filter(
          (tick, index, ticks) => index === 0 || tick !== ticks[index - 1],
        )
      : [0];
  const step = series.length > 1 ? chartWidth / (series.length - 1) : 0;
  const plottedPoints = values.map((value, index) => {
    const x = chartLeft + step * index;
    const y = chartBottom - (Math.max(0, value) / max) * chartHeight;
    return { value, x, y };
  });
  const points = plottedPoints
    .map((value) => {
      return `${value.x},${value.y}`;
    })
    .join(' ');
  const first = series[0]?.date;
  const middle = series[Math.floor(series.length / 2)]?.date;
  const last = series[series.length - 1]?.date;
  const activePoint =
    activeIndex === null || activeIndex >= plottedPoints.length
      ? null
      : (plottedPoints[activeIndex] ?? null);
  const activeSeriesPoint =
    activeIndex === null || activeIndex >= series.length ? null : (series[activeIndex] ?? null);
  const tooltipWidth = 108;
  const tooltipHeight = 34;
  const tooltipX =
    activePoint === null
      ? 0
      : Math.min(width - tooltipWidth - 4, Math.max(4, activePoint.x - tooltipWidth / 2));
  const tooltipY = activePoint === null ? 0 : Math.max(4, activePoint.y - tooltipHeight - 10);

  function pointerIndex(event: ReactPointerEvent<SVGSVGElement>): number | null {
    if (series.length === 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (x - chartLeft) / chartWidth;
    const index = Math.round(ratio * (series.length - 1));
    return Math.max(0, Math.min(series.length - 1, index));
  }

  function handlePointer(event: ReactPointerEvent<SVGSVGElement>): void {
    const nextIndex = pointerIndex(event);
    if (nextIndex !== null) setActiveIndex(nextIndex);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      onPointerDown={handlePointer}
      onPointerMove={handlePointer}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setActiveIndex(null);
      }}
      style={{ width: '100%', height: 154, display: 'block', touchAction: 'none' }}
    >
      {tickValues.map((tick) => {
        const y = chartBottom - (tick / max) * chartHeight;
        return (
          <g key={tick}>
            <text
              x={chartLeft - 7}
              y={y + 4}
              fill="rgba(15, 23, 42, 0.52)"
              fontSize="9"
              fontWeight="700"
              textAnchor="end"
            >
              {formatAxisValue(tick)}
            </text>
            <line
              x1={chartLeft}
              x2={chartRight}
              y1={y}
              y2={y}
              stroke="rgba(15, 23, 42, 0.12)"
              strokeDasharray="4 5"
            />
          </g>
        );
      })}
      <line
        x1={chartLeft}
        x2={chartLeft}
        y1={chartTop}
        y2={chartBottom}
        stroke="rgba(15, 23, 42, 0.38)"
      />
      <line
        x1={chartLeft}
        x2={chartRight}
        y1={chartBottom}
        y2={chartBottom}
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
      {activePoint !== null && activeSeriesPoint !== null ? (
        <g pointerEvents="none">
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={chartTop}
            y2={chartBottom}
            stroke="rgba(15, 23, 42, 0.22)"
            strokeDasharray="3 5"
          />
          <circle cx={activePoint.x} cy={activePoint.y} r="5" fill={color} />
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r="8"
            fill="none"
            stroke="rgba(255, 255, 255, 0.82)"
            strokeWidth="2"
          />
          <rect
            x={tooltipX}
            y={tooltipY}
            width={tooltipWidth}
            height={tooltipHeight}
            rx="9"
            fill="rgba(15, 23, 42, 0.92)"
          />
          <text x={tooltipX + 8} y={tooltipY + 13} fill="#fff" fontSize="9" fontWeight="800">
            {shortDateText(activeSeriesPoint.date)}
          </text>
          <text x={tooltipX + 8} y={tooltipY + 27} fill="#fff" fontSize="11" fontWeight="950">
            {formatValue(activePoint.value)}
          </text>
        </g>
      ) : null}
      {first && (
        <text x={chartLeft} y={height - 5} fill="rgba(15, 23, 42, 0.58)" fontSize="10">
          {shortDateText(first)}
        </text>
      )}
      {middle && (
        <text
          x={width / 2}
          y={height - 5}
          fill="rgba(15, 23, 42, 0.58)"
          fontSize="10"
          textAnchor="middle"
        >
          {shortDateText(middle)}
        </text>
      )}
      {last && (
        <text
          x={chartRight}
          y={height - 5}
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
          padding: '0 14px',
          height: 46,
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Search size={16} color="var(--muted)" aria-hidden />
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
            height: 24,
            padding: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            lineHeight: '24px',
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
  const [selectedAchievement, setSelectedAchievement] = useState<AdminUserAchievement | null>(null);
  const [confirmAction, setConfirmAction] = useState<'save' | 'block' | null>(null);
  const [role, setRole] = useState<AdminRole>(user.role);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [grip, setGrip] = useState(user.grip);
  const [level, setLevel] = useState(fieldNumber(user.level));
  const [stars, setStars] = useState(fieldNumber(user.xp));
  const [experience, setExperience] = useState(fieldNumber(user.experience));
  const [lifetimeShots, setLifetimeShots] = useState(fieldNumber(user.lifetimeShotsTotal));
  const [lifetimeGoals, setLifetimeGoals] = useState(fieldNumber(user.lifetimeGoalsTotal));
  const [coins, setCoins] = useState(fieldNumber(user.wallet.coins));
  const [shotsCurrent, setShotsCurrent] = useState(fieldNumber(user.wallet.shotsCurrent));
  const [shotsMax, setShotsMax] = useState(fieldNumber(user.wallet.shotsMax));

  useEffect(() => {
    setRole(user.role);
    setDisplayName(user.displayName);
    setGrip(user.grip);
    setLevel(fieldNumber(user.level));
    setStars(fieldNumber(user.xp));
    setExperience(fieldNumber(user.experience));
    setLifetimeShots(fieldNumber(user.lifetimeShotsTotal));
    setLifetimeGoals(fieldNumber(user.lifetimeGoalsTotal));
    setCoins(fieldNumber(user.wallet.coins));
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
      xp: Number(stars),
      experience: Number(experience),
      lifetimeShotsTotal: Number(lifetimeShots),
      lifetimeGoalsTotal: Number(lifetimeGoals),
      wallet: {
        coins: Number(coins),
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
              <AdminField label="Уровень">
                <input value={level} onChange={(event) => setLevel(event.target.value)} />
              </AdminField>
              <AdminField label="Звёзды">
                <input value={stars} onChange={(event) => setStars(event.target.value)} />
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
              <AdminField label="Монеты">
                <input value={coins} onChange={(event) => setCoins(event.target.value)} />
              </AdminField>
              <AdminField label="Опыт">
                <input value={experience} onChange={(event) => setExperience(event.target.value)} />
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
    { label: 'Монеты', value: numberText(user.wallet.coins) },
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
  achievements: AdminUserAchievement[];
  onOpenAchievement: (achievement: AdminUserAchievement) => void;
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
        Задания{achievements.length > 0 ? ` (${unlocked}/${achievements.length})` : ''}
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
          Задания не загружены.
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

function NotificationsPanel({
  loading,
  notifications,
  monitoring,
  monitoringLoading,
  onChanged,
}: {
  loading: boolean;
  notifications: AdminPushNotification[];
  monitoring: AdminPushMonitoringResponse | null;
  monitoringLoading: boolean;
  onChanged: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState<AdminPushNotification | null>(null);
  const enabledCount = notifications.filter((item) => item.isEnabled).length;

  return (
    <>
      <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
        Уведомления ({numberText(notifications.length)})
      </div>
      <section
        className="glass"
        style={{
          borderRadius: 20,
          padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <div
          style={{
            border: '1px solid rgba(255, 255, 255, 0.72)',
            borderRadius: 16,
            padding: 10,
            background: 'rgba(255, 255, 255, 0.28)',
          }}
        >
          <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>Активные</div>
          <div style={{ marginTop: 5, color: 'var(--ink)', fontSize: 22, fontWeight: 950 }}>
            {loading ? '-' : numberText(enabledCount)}
          </div>
        </div>
        <div
          style={{
            border: '1px solid rgba(255, 255, 255, 0.72)',
            borderRadius: 16,
            padding: 10,
            background: 'rgba(255, 255, 255, 0.28)',
          }}
        >
          <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>Всего</div>
          <div style={{ marginTop: 5, color: 'var(--ink)', fontSize: 22, fontWeight: 950 }}>
            {loading ? '-' : numberText(notifications.length)}
          </div>
        </div>
      </section>
      <PushMonitoringPanel
        loading={monitoringLoading}
        monitoring={monitoring}
        notifications={notifications}
      />
      {editing !== null && (
        <NotificationEditor
          notification={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <AdminPlainState>Загрузка уведомлений...</AdminPlainState>}
        {!loading && notifications.length === 0 && (
          <AdminPlainState>Уведомлений пока нет</AdminPlainState>
        )}
        {notifications.map((notification) => (
          <NotificationTemplateCard
            key={notification.key}
            notification={notification}
            onEdit={() => setEditing(notification)}
          />
        ))}
      </section>
    </>
  );
}

function PushMonitoringPanel({
  loading,
  monitoring,
  notifications,
}: {
  loading: boolean;
  monitoring: AdminPushMonitoringResponse | null;
  notifications: AdminPushNotification[];
}): JSX.Element {
  const titleByKey = new Map(notifications.map((item) => [item.key, item.title]));
  const overview = monitoring?.overview ?? null;
  const eventStats = monitoring?.byEventType.slice(0, 6) ?? [];
  const recent = monitoring?.recent.slice(0, 6) ?? [];
  const delivered = overview ? overview.sent + overview.partial : 0;

  function eventTitle(key: AdminPushNotificationKey): string {
    return titleByKey.get(key) ?? key;
  }

  return (
    <>
      <div className="section-label" style={{ margin: '8px 0 -4px -14px' }}>
        Мониторинг доставок
      </div>
      <section
        className="glass"
        style={{ borderRadius: 20, padding: 12, display: 'grid', gap: 10 }}
      >
        {loading && monitoring === null ? (
          <AdminPlainState>Загрузка очереди...</AdminPlainState>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <DashboardMiniStat
                label="В очереди"
                value={numberText(overview?.queued ?? 0)}
                note={`к отправке ${numberText(overview?.dueQueued ?? 0)}`}
              />
              <DashboardMiniStat
                label="Доставлено"
                value={numberText(delivered)}
                note={`${numberText(overview?.subscriptionSentCount ?? 0)} подпискам`}
              />
              <DashboardMiniStat
                label="Ошибки"
                value={numberText((overview?.failed ?? 0) + (overview?.partial ?? 0))}
                note={`зависло ${numberText(overview?.staleProcessing ?? 0)}`}
              />
              <DashboardMiniStat
                label="Клики"
                value={numberText(overview?.clickCount ?? 0)}
                note={`CTR ${percentText(overview?.deliveryClickRate ?? 0)}`}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {monitoring?.byStatus.map((item) => (
                <span key={item.status} className="pill" style={{ fontSize: 10 }}>
                  {pushDeliveryStatusLabels[item.status]}: {numberText(item.count)}
                </span>
              ))}
              <span className="pill" style={{ fontSize: 10 }}>
                Старейшая очередь: {secondsAgeText(overview?.oldestQueuedAgeSeconds ?? 0)}
              </span>
              <span className="pill" style={{ fontSize: 10 }}>
                Обновлено {dateTimeText(monitoring?.generatedAt)}
              </span>
            </div>
            {monitoring && (
              <div style={{ display: 'grid', gap: 7 }}>
                {monitoring.alerts.length === 0 ? (
                  <div
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.72)',
                      borderRadius: 15,
                      padding: '9px 10px',
                      background: 'rgba(255, 255, 255, 0.24)',
                      color: 'var(--muted)',
                      fontSize: 11,
                      fontWeight: 850,
                    }}
                  >
                    Очередь работает штатно, критичных alert-ов нет.
                  </div>
                ) : (
                  monitoring.alerts.map((alert) => (
                    <div
                      key={alert.key}
                      style={{
                        border:
                          alert.severity === 'danger'
                            ? '1px solid rgba(185, 28, 28, 0.42)'
                            : '1px solid rgba(180, 83, 9, 0.42)',
                        borderRadius: 15,
                        padding: '9px 10px',
                        background:
                          alert.severity === 'danger'
                            ? 'rgba(254, 226, 226, 0.56)'
                            : 'rgba(254, 243, 199, 0.56)',
                      }}
                    >
                      <div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 950 }}>
                        {alert.title}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          color: 'rgba(15, 23, 42, 0.72)',
                          fontSize: 11,
                          fontWeight: 800,
                          lineHeight: 1.35,
                        }}
                      >
                        {alert.body}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {eventStats.length > 0 ? (
              <div style={{ display: 'grid', gap: 7 }}>
                {eventStats.map((item) => (
                  <div
                    key={item.eventType}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 8,
                      alignItems: 'center',
                      border: '1px solid rgba(255, 255, 255, 0.72)',
                      borderRadius: 15,
                      padding: '9px 10px',
                      background: 'rgba(255, 255, 255, 0.26)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--ink)',
                          fontSize: 12,
                          fontWeight: 950,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {eventTitle(item.eventType)}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          color: 'var(--muted)',
                          fontSize: 10,
                          fontWeight: 800,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {item.eventType}
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'end' }}
                    >
                      <span className="pill" style={{ fontSize: 10 }}>
                        {numberText(item.sent + item.partial)}/{numberText(item.total)}
                      </span>
                      <span className="pill" style={{ fontSize: 10 }}>
                        {numberText(item.clickCount)} кликов
                      </span>
                      <span className="pill" style={{ fontSize: 10 }}>
                        {percentText(item.deliveryClickRate)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AdminPlainState>Доставок пока нет</AdminPlainState>
            )}
            {recent.length > 0 && (
              <div style={{ display: 'grid', gap: 7 }}>
                <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>
                  Последние доставки
                </div>
                {recent.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 8,
                      alignItems: 'center',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.42)',
                      paddingBottom: 7,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: 'var(--ink)',
                          fontSize: 12,
                          fontWeight: 900,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.userDisplayName} · {eventTitle(item.eventType)}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          color: 'var(--muted)',
                          fontSize: 10,
                          fontWeight: 800,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {item.eventKey}
                      </div>
                      {item.lastErrorMessage && (
                        <div
                          style={{
                            marginTop: 3,
                            color: '#b91c1c',
                            fontSize: 10,
                            fontWeight: 850,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.lastErrorMessage}
                        </div>
                      )}
                    </div>
                    <div
                      style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'end' }}
                    >
                      <span className={item.status === 'sent' ? 'pill pill--dark' : 'pill'}>
                        {pushDeliveryStatusLabels[item.status]}
                      </span>
                      <span className="pill" style={{ fontSize: 10 }}>
                        {numberText(item.sentCount)}/{numberText(item.subscriptionCount)}
                      </span>
                      <span className="pill" style={{ fontSize: 10 }}>
                        {numberText(item.clickCount)} кликов
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function NotificationTemplateCard({
  notification,
  onEdit,
}: {
  notification: AdminPushNotification;
  onEdit: () => void;
}): JSX.Element {
  return (
    <article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={notification.isEnabled ? 'pill pill--dark' : 'pill'}>
              {notification.isEnabled ? 'Вкл.' : 'Выкл.'}
            </span>
            <span className="pill" style={{ fontSize: 10 }}>
              {pushNotificationCategoryLabels[notification.category]}
            </span>
            <span className="pill" style={{ fontSize: 10 }}>
              {notification.key}
            </span>
          </div>
          <div style={{ marginTop: 8, color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>
            {notification.title}
          </div>
          <div
            style={{
              marginTop: 5,
              color: 'rgba(15, 23, 42, 0.78)',
              fontSize: 13,
              fontWeight: 750,
              lineHeight: 1.35,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {notification.body}
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onEdit}
          aria-label={`Редактировать ${notification.title}`}
          title="Редактировать"
          style={{ width: 44, height: 44 }}
        >
          <Pencil size={15} />
        </button>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        <NotificationInfo label="Триггер" value={notification.trigger} />
        <NotificationInfo label="Путь" value={notification.clickUrl} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="pill" style={{ fontSize: 10 }}>
          Обновлено {dateText(notification.updatedAt)}
        </span>
        {notification.updatedByDisplayName && (
          <span className="pill" style={{ fontSize: 10 }}>
            {notification.updatedByDisplayName}
          </span>
        )}
      </div>
    </article>
  );
}

function NotificationInfo({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.72)',
        borderRadius: 14,
        padding: '8px 9px',
        background: 'rgba(255, 255, 255, 0.3)',
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          color: 'var(--ink)',
          fontSize: 12,
          fontWeight: 850,
          overflowWrap: 'anywhere',
          lineHeight: 1.35,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function NotificationEditor({
  notification,
  onCancel,
  onSaved,
}: {
  notification: AdminPushNotification;
  onCancel: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [title, setTitle] = useState(notification.title);
  const [body, setBody] = useState(notification.body);
  const [trigger, setTrigger] = useState(notification.trigger);
  const [clickUrl, setClickUrl] = useState(notification.clickUrl);
  const [status, setStatus] = useState<'enabled' | 'disabled'>(
    notification.isEnabled ? 'enabled' : 'disabled',
  );
  const mutation = useMutation({
    mutationFn: () => {
      const patch: AdminPushNotificationPatch = {
        title: title.trim(),
        body: body.trim(),
        trigger: trigger.trim(),
        clickUrl: clickUrl.trim(),
        isEnabled: status === 'enabled',
      };
      return patchAdminNotification(notification.key as AdminPushNotificationKey, patch);
    },
    onSuccess: onSaved,
  });
  const normalizedClickUrl = clickUrl.trim();
  const canSave =
    title.trim() !== '' &&
    body.trim() !== '' &&
    trigger.trim() !== '' &&
    normalizedClickUrl.startsWith('/') &&
    !normalizedClickUrl.startsWith('//');

  return (
    <section className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
            Редактирование уведомления
          </div>
          <div
            style={{
              marginTop: 4,
              color: 'var(--muted)',
              fontSize: 11,
              fontWeight: 800,
              overflowWrap: 'anywhere',
            }}
          >
            {notification.key}
          </div>
        </div>
        <span className="pill">{pushNotificationCategoryLabels[notification.category]}</span>
      </div>
      <AdminField label="Статус">
        <GlassSelect
          value={status}
          options={pushNotificationStatusOptions}
          onChange={setStatus}
          ariaLabel="Статус уведомления"
        />
      </AdminField>
      <AdminField label="Заголовок">
        <input
          aria-label="Заголовок"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </AdminField>
      <AdminField label="Текст">
        <textarea
          aria-label="Текст"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          style={{ resize: 'vertical', minHeight: 84, lineHeight: 1.35 }}
        />
      </AdminField>
      <AdminField label="Триггер">
        <textarea
          aria-label="Триггер"
          value={trigger}
          onChange={(event) => setTrigger(event.target.value)}
          rows={3}
          style={{ resize: 'vertical', minHeight: 84, lineHeight: 1.35 }}
        />
      </AdminField>
      <AdminField label="Путь при клике">
        <input
          aria-label="Путь при клике"
          value={clickUrl}
          onChange={(event) => setClickUrl(event.target.value)}
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

function AdminChatAvatarControl({
  title,
  name,
  avatarUrl,
  busy,
  onUpload,
  onReset,
}: {
  title: string;
  name: string;
  avatarUrl: string | null;
  busy: boolean;
  onUpload: () => void;
  onReset: () => void;
}): JSX.Element {
  const initial = name.charAt(0).toUpperCase() || '?';
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 10,
        background: 'rgba(255,255,255,0.44)',
        border: '1px solid rgba(255,255,255,0.7)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{ width: 38, height: 38, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              background: 'var(--dark)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 950,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: 'var(--ink)' }}>{title}</div>
          <div
            style={{
              marginTop: 2,
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="icon-btn"
          disabled={busy}
          onClick={onUpload}
          aria-label={`Загрузить ${title}`}
          title={`Загрузить ${title}`}
          style={{ width: 36, height: 36, minWidth: 36 }}
        >
          <Upload size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={busy || !avatarUrl}
          onClick={onReset}
          aria-label={`Удалить ${title}`}
          title={`Удалить ${title}`}
          style={{ width: 36, height: 36, minWidth: 36 }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function ChatProfileEditorModal({
  profile,
  pending,
  error,
  onCancel,
  onSave,
}: {
  profile: { id: string; name: string | null; description: string | null; title: string };
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (name: string, description: string) => void;
}): JSX.Element {
  const [name, setName] = useState(profile.name ?? '');
  const [description, setDescription] = useState(profile.description ?? '');
  const canSave = name.trim().length > 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Редактировать ${profile.title.toLowerCase()}`}
      onClick={onCancel}
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
          maxWidth: 420,
          borderRadius: 24,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>{profile.title}</div>
        <AdminField label="Название">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </AdminField>
        <AdminField label="Описание">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            style={{ resize: 'vertical', minHeight: 96, lineHeight: 1.35 }}
          />
        </AdminField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={pending}
            style={{ padding: 10, fontSize: 12, letterSpacing: 0 }}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--cta"
            onClick={() => onSave(name.trim(), description.trim())}
            disabled={pending || !canSave}
            style={{ padding: 10, fontSize: 12, letterSpacing: 0 }}
          >
            Сохранить
          </button>
        </div>
        {error != null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            {error instanceof Error ? error.message : 'Ошибка сохранения'}
          </div>
        )}
      </section>
    </div>,
    document.body,
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
  const [channelView, setChannelView] = useState<'root' | 'engagement' | 'posts'>('root');
  const [editingPost, setEditingPost] = useState<AdminChannelPost | null>(null);
  const [editingChatProfile, setEditingChatProfile] = useState<{
    id: string;
    name: string | null;
    description: string | null;
    title: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminChannelPost | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarTarget, setAvatarTarget] = useState<'channel' | 'mainChat' | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
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
  const uploadAvatarMutation = useMutation({
    mutationFn: async (input: { chatId: string; file: File }) => {
      const webp = await convertChatAvatarToWebp(input.file);
      return uploadAdminChatAvatar(input.chatId, webp);
    },
    onSuccess: () => {
      setAvatarError(null);
      onChanged();
    },
    onError: (err) => {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось загрузить аватар.');
    },
  });
  const resetAvatarMutation = useMutation({
    mutationFn: (chatId: string) => resetAdminChatAvatar(chatId),
    onSuccess: () => {
      setAvatarError(null);
      onChanged();
    },
    onError: (err) => {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось сбросить аватар.');
    },
  });
  const profileMutation = useMutation({
    mutationFn: (input: { chatId: string; name: string; description: string }) =>
      patchAdminChatProfile(input.chatId, { name: input.name, description: input.description }),
    onSuccess: () => {
      setEditingChatProfile(null);
      onChanged();
    },
  });
  const summary = data?.summary;
  const engagementCards = [
    {
      label: 'Просмотры',
      value: numberText(summary?.views ?? 0),
      hint: `${numberText(summary?.viewEvents ?? 0)} событий`,
      icon: <UserCheck size={15} />,
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
  const rootCards = [
    {
      id: 'engagement' as const,
      title: 'Вовлеченность',
      icon: <BarChart3 size={18} />,
      value: percentText(summary?.engagementRate ?? 0),
      note: `${numberText(summary?.engagedUsers ?? 0)} из ${numberText(summary?.totalUsers ?? 0)} игроков`,
      meta: `${numberText(summary?.views ?? 0)} просмотров · ${numberText(summary?.comments ?? 0)} комм.`,
    },
    {
      id: 'posts' as const,
      title: 'Посты',
      icon: <Megaphone size={18} />,
      value: numberText(summary?.posts ?? 0),
      note: channelPeriodOptions.find((option) => option.value === period)?.label ?? 'Период',
      meta: `${numberText(summary?.reactions ?? 0)} реакций · ${numberText(summary?.likes ?? 0)} лайков`,
    },
  ];

  return (
    <>
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = '';
          if (!file || avatarTarget === null) return;
          const chatId = avatarTarget === 'channel' ? data?.channel?.id : data?.mainChat?.id;
          if (!chatId) return;
          uploadAvatarMutation.mutate({ chatId, file });
        }}
      />
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
            <div
              style={{
                marginTop: 4,
                color: 'var(--muted)',
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1.3,
              }}
            >
              {data?.channel?.description || 'Статистика, посты и вовлеченность игроков'}
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
        {(data?.channel || data?.mainChat) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {data?.channel && (
              <div style={{ display: 'grid', gap: 8 }}>
                <AdminChatAvatarControl
                  title="Аватар канала"
                  name={data.channel.name ?? 'Новости игры'}
                  avatarUrl={data.channel.avatarUrl ?? null}
                  busy={uploadAvatarMutation.isPending || resetAvatarMutation.isPending}
                  onUpload={() => {
                    setAvatarTarget('channel');
                    avatarInputRef.current?.click();
                  }}
                  onReset={() => resetAvatarMutation.mutate(data.channel!.id)}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    setEditingChatProfile({
                      id: data.channel!.id,
                      name: data.channel!.name,
                      description: data.channel!.description,
                      title: 'Канал',
                    })
                  }
                  aria-label="Редактировать канал"
                  title="Редактировать канал"
                  style={{ justifySelf: 'end', width: 34, height: 34 }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
            {data?.mainChat && (
              <div style={{ display: 'grid', gap: 8 }}>
                <AdminChatAvatarControl
                  title="Аватар чата"
                  name={data.mainChat.name ?? 'Общий чат'}
                  avatarUrl={data.mainChat.avatarUrl ?? null}
                  busy={uploadAvatarMutation.isPending || resetAvatarMutation.isPending}
                  onUpload={() => {
                    setAvatarTarget('mainChat');
                    avatarInputRef.current?.click();
                  }}
                  onReset={() => resetAvatarMutation.mutate(data.mainChat!.id)}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    setEditingChatProfile({
                      id: data.mainChat!.id,
                      name: data.mainChat!.name,
                      description: data.mainChat!.description,
                      title: 'Чат',
                    })
                  }
                  aria-label="Редактировать чат"
                  title="Редактировать чат"
                  style={{ justifySelf: 'end', width: 34, height: 34 }}
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
          </div>
        )}
        {avatarError && (
          <div style={{ color: 'var(--red-deep)', fontSize: 11, fontWeight: 800 }}>
            {avatarError}
          </div>
        )}
      </section>

      {editingChatProfile !== null && (
        <ChatProfileEditorModal
          profile={editingChatProfile}
          pending={profileMutation.isPending}
          error={profileMutation.error}
          onCancel={() => setEditingChatProfile(null)}
          onSave={(name, description) =>
            profileMutation.mutate({ chatId: editingChatProfile.id, name, description })
          }
        />
      )}

      {channelView === 'root' && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {rootCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="glass"
              onClick={() => setChannelView(card.id)}
              style={{
                minHeight: 132,
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
                <span className="pill pill--dark" style={{ padding: 8 }}>
                  {card.icon}
                </span>
                <ChevronRight size={17} color="var(--muted)" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>
                  {card.title}
                </div>
                <div
                  style={{
                    marginTop: 7,
                    color: 'var(--ink)',
                    fontSize: 24,
                    fontWeight: 950,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {loading ? '-' : card.value}
                </div>
                <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>
                  {card.note}
                </div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>
                {card.meta}
              </div>
            </button>
          ))}
          {loading && (
            <AdminPlainState style={{ gridColumn: '1 / -1' }}>Загрузка...</AdminPlainState>
          )}
        </section>
      )}

      {channelView === 'engagement' && (
        <>
          <button
            type="button"
            className="chip"
            onClick={() => setChannelView('root')}
            style={{
              justifySelf: 'start',
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowDown size={14} style={{ transform: 'rotate(90deg)' }} />
            Назад
          </button>
          <section
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}
          >
            {engagementCards.map((card) => (
              <div key={card.label} className="glass" style={{ borderRadius: 18, padding: 12 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)' }}
                >
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
                  {loading ? '-' : card.value}
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
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                alignItems: 'center',
              }}
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
        </>
      )}

      {channelView === 'posts' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="chip"
            onClick={() => setChannelView('root')}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowDown size={14} style={{ transform: 'rotate(90deg)' }} />
            Назад
          </button>
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
      )}

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

function AnticheatPanel({
  loading,
  data,
  period,
  onPeriod,
}: {
  loading: boolean;
  data: AdminMismatchesResponse | undefined;
  period: AdminMismatchPeriod;
  onPeriod: (value: AdminMismatchPeriod) => void;
}): JSX.Element {
  const periodLabel = dashboardPeriodLabel(data?.period ?? period);
  const statCards = [
    {
      label: 'Мисматчи',
      value: numberText(data?.periodTotal ?? 0),
      note: periodLabel,
    },
    {
      label: 'За 24ч',
      value: numberText(data?.last24h ?? 0),
      note: 'последние сутки',
    },
    {
      label: 'Игроков',
      value: numberText(data?.usersAffected ?? 0),
      note: 'с событиями',
    },
  ];

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 126px',
          gap: 8,
          alignItems: 'center',
          margin: '2px 0 -4px 0',
        }}
      >
        <div className="section-label" style={{ margin: '0 0 0 -14px' }}>
          Античит
        </div>
        <GlassSelect
          value={period}
          options={dashboardPeriodOptions}
          onChange={onPeriod}
          ariaLabel="Период античита"
        />
      </div>
      <section
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}
      >
        {statCards.map((card) => (
          <div key={card.label} className="glass" style={{ borderRadius: 18, padding: 11 }}>
            <div style={{ color: 'var(--ink)', fontSize: 21, fontWeight: 950 }}>
              {loading ? '-' : card.value}
            </div>
            <div style={{ marginTop: 7, color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>
              {card.label}
            </div>
            <div style={{ marginTop: 3, color: 'var(--ink)', fontSize: 10, fontWeight: 750 }}>
              {card.note}
            </div>
          </div>
        ))}
      </section>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          Логи ({loading ? '-' : numberText(data?.logs.length ?? 0)})
        </div>
        {loading && <AdminPlainState>Загрузка логов античита...</AdminPlainState>}
        {!loading && (data?.logs.length ?? 0) === 0 && (
          <AdminPlainState>Мисматчей за период нет</AdminPlainState>
        )}
        {(data?.logs ?? []).map((log) => (
          <MismatchLogCard key={log.id} log={log} />
        ))}
      </section>
    </>
  );
}

function MismatchLogCard({ log }: { log: AdminMismatchLog }): JSX.Element {
  const initial = log.userDisplayName.charAt(0).toUpperCase() || '?';
  const payloadText = JSON.stringify(log.payload, null, 2);
  const shortSessionId = log.sessionId ? log.sessionId.slice(0, 8) : '-';
  const shortShotSessionId = log.shotSessionId ? log.shotSessionId.slice(0, 8) : '-';
  return (
    <article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '42px minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {log.userAvatarUrl ? (
          <img
            src={log.userAvatarUrl}
            alt=""
            style={{ width: 42, height: 42, borderRadius: 999, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 950,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 950,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {log.userDisplayName}
          </div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>
            {dateTimeText(log.createdAt)}
          </div>
        </div>
        <span className="pill pill--dark" style={{ fontSize: 10 }}>
          {gameModeLabel(log.mode)}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <MismatchInfo label="Период" value={log.periodNumber?.toString() ?? '-'} />
        <MismatchInfo label="Бросок" value={log.shotIndex?.toString() ?? '-'} />
        <MismatchInfo label="Клиент" value={shotResultLabel(log.claimedResult)} />
        <MismatchInfo label="Сервер" value={shotResultLabel(log.serverResult)} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="pill" style={{ fontSize: 10 }}>
          user {log.userId.slice(0, 8)}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          session {shortSessionId}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          shot {shortShotSessionId}
        </span>
        {log.gameCoreVersion !== null && (
          <span className="pill" style={{ fontSize: 10 }}>
            core v{log.gameCoreVersion}
          </span>
        )}
      </div>
      <details>
        <summary style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
          Payload
        </summary>
        <pre
          style={{
            margin: '8px 0 0',
            padding: 10,
            borderRadius: 14,
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#ffffff',
            overflowX: 'auto',
            fontSize: 10,
            lineHeight: 1.45,
          }}
        >
          {payloadText}
        </pre>
      </details>
    </article>
  );
}

function MismatchInfo({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        border: '1px solid rgba(255, 255, 255, 0.72)',
        borderRadius: 14,
        padding: '8px 9px',
        background: 'rgba(255, 255, 255, 0.3)',
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          color: 'var(--ink)',
          fontSize: 13,
          fontWeight: 950,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
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
  ratingStats,
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
  ratingStats: { count: number; average: number | null };
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
          style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <FeedbackMetric label="Непрочитанные" value={numberText(unreadCount)} />
          <FeedbackMetric label="Оценки" value={numberText(ratingStats.count)} />
          <FeedbackMetric
            label="Средняя"
            value={
              ratingStats.average === null
                ? '—'
                : ratingStats.average.toLocaleString('ru-RU', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })
            }
            suffix={ratingStats.average === null ? '' : '/5'}
          />
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
            onMarkRead={() => markMutation.mutate({ id: item.id, isRead: true })}
          />
        ))}
      </section>
    </>
  );
}

function FeedbackMetric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}): JSX.Element {
  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid rgba(255, 255, 255, 0.72)',
        borderRadius: 15,
        padding: '8px 8px 9px',
        background: 'rgba(255, 255, 255, 0.24)',
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          color: 'var(--ink)',
          fontFamily: 'var(--font-mono)',
          fontSize: 18,
          fontWeight: 950,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
        {suffix && (
          <span style={{ marginLeft: 3, fontSize: 11, fontFamily: 'var(--font-ui)' }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function FeedbackCard({
  item,
  pending,
  onMarkRead,
}: {
  item: AdminFeedback;
  pending: boolean;
  onMarkRead: () => void;
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
        {item.isRead ? (
          <span
            className="pill"
            style={{
              minHeight: 38,
              padding: '0 12px',
              borderRadius: 13,
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            Прочитано
          </span>
        ) : (
          <button
            type="button"
            className="btn btn--cta"
            disabled={pending}
            onClick={onMarkRead}
            style={{
              minHeight: 38,
              padding: '0 12px',
              borderRadius: 13,
              fontSize: 11,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Прочитать
          </button>
        )}
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
            {inventoryItemKindLabel(item.itemKind)}
          </span>
          <span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>
            Зарядов {numberText(item.chargesPerPurchase)}
          </span>
          <span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>
            Дуэль {numberText(item.duelPeriodCost)}/период
          </span>
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
  const [itemKind, setItemKind] = useState<AdminInventoryItemKind>(item?.itemKind ?? 'consumable');
  const [currencyPrice, setCurrencyPrice] = useState(fieldNumber(item?.currencyPrice ?? 0));
  const [chargesPerPurchase, setChargesPerPurchase] = useState(inventoryChargeFieldValue(item));
  const [lowStockThreshold, setLowStockThreshold] = useState(
    fieldNumber(
      item?.lowStockThreshold ?? inventoryLowStockDefault(item?.itemKind ?? 'consumable'),
    ),
  );
  const [duelPeriodCost, setDuelPeriodCost] = useState(fieldNumber(item?.duelPeriodCost ?? 0));
  const [effectPuckSpeedPoints, setEffectPuckSpeedPoints] = useState(
    puckSpeedPointsFieldValue(item),
  );
  const [effectShooterFrequencyDelta, setEffectShooterFrequencyDelta] = useState(
    fieldNumber(item?.effectShooterFrequencyDelta ?? 0),
  );
  const [effectGoalieFrequencyDelta, setEffectGoalieFrequencyDelta] = useState(
    fieldNumber(item?.effectGoalieFrequencyDelta ?? 0),
  );
  const [effectGoalFrequencyDelta, setEffectGoalFrequencyDelta] = useState(
    fieldNumber(item?.effectGoalFrequencyDelta ?? 0),
  );
  const [effectShotZoneMultiplier, setEffectShotZoneMultiplier] = useState(
    fieldNumber(item?.effectShotZoneMultiplier ?? 1),
  );
  const [effectStumbleIntervalMinRolls, setEffectStumbleIntervalMinRolls] = useState(
    fieldNumber(item?.effectStumbleIntervalMinRolls ?? 90),
  );
  const [effectStumbleIntervalMaxRolls, setEffectStumbleIntervalMaxRolls] = useState(
    fieldNumber(item?.effectStumbleIntervalMaxRolls ?? 130),
  );
  const [effectStumbleDurationMinMs, setEffectStumbleDurationMinMs] = useState(
    fieldNumber(item?.effectStumbleDurationMinMs ?? 500),
  );
  const [effectStumbleDurationMaxMs, setEffectStumbleDurationMaxMs] = useState(
    fieldNumber(item?.effectStumbleDurationMaxMs ?? 700),
  );
  const [effectStumbleOffsetMinPx, setEffectStumbleOffsetMinPx] = useState(
    fieldNumber(item?.effectStumbleOffsetMinPx ?? 20),
  );
  const [effectStumbleOffsetMaxPx, setEffectStumbleOffsetMaxPx] = useState(
    fieldNumber(item?.effectStumbleOffsetMaxPx ?? 45),
  );
  const [effectStumbleRecoveryMinMs, setEffectStumbleRecoveryMinMs] = useState(
    fieldNumber(item?.effectStumbleRecoveryMinMs ?? 200),
  );
  const [effectStumbleRecoveryMaxMs, setEffectStumbleRecoveryMaxMs] = useState(
    fieldNumber(item?.effectStumbleRecoveryMaxMs ?? 300),
  );
  const [effectEnergyBaselineSpeed, setEffectEnergyBaselineSpeed] = useState(
    fieldNumber(item?.effectEnergyBaselineSpeed ?? 0.75),
  );
  const [effectFatigueGraceMs, setEffectFatigueGraceMs] = useState(
    fieldNumber(item?.effectFatigueGraceMs ?? 30_000),
  );
  const [effectFatigueSlowdownStartMs, setEffectFatigueSlowdownStartMs] = useState(
    fieldNumber(item?.effectFatigueSlowdownStartMs ?? 30_000),
  );
  const [effectFatigueHeavySlowdownStartMs, setEffectFatigueHeavySlowdownStartMs] = useState(
    fieldNumber(item?.effectFatigueHeavySlowdownStartMs ?? 75_000),
  );
  const [effectFatigueStopStartMs, setEffectFatigueStopStartMs] = useState(
    fieldNumber(item?.effectFatigueStopStartMs ?? 90_000),
  );
  const [effectFatigueStopDurationMs, setEffectFatigueStopDurationMs] = useState(
    fieldNumber(item?.effectFatigueStopDurationMs ?? 5_000),
  );
  const [effectFatigueAfterRestMs, setEffectFatigueAfterRestMs] = useState(
    fieldNumber(item?.effectFatigueAfterRestMs ?? 45_000),
  );
  const [effectFatigueSlowMultiplier, setEffectFatigueSlowMultiplier] = useState(
    fieldNumber(item?.effectFatigueSlowMultiplier ?? 0.9),
  );
  const [effectFatigueHeavyMultiplier, setEffectFatigueHeavyMultiplier] = useState(
    fieldNumber(item?.effectFatigueHeavyMultiplier ?? 0.75),
  );
  const parsedPriceRub = parseAdminIntegerInput(priceRub);
  const parsedCurrencyPrice = parseAdminIntegerInput(currencyPrice);
  const parsedChargesPerPurchase = parseAdminNumberInput(chargesPerPurchase);
  const parsedLowStockThreshold = parseAdminIntegerInput(lowStockThreshold);
  const parsedDuelPeriodCost = parseAdminIntegerInput(duelPeriodCost);
  const parsedEffectPuckSpeedPoints = parseAdminNumberInput(effectPuckSpeedPoints);
  const parsedEffectShooterFrequencyDelta = parseAdminNumberInput(effectShooterFrequencyDelta);
  const parsedEffectGoalieFrequencyDelta = parseAdminNumberInput(effectGoalieFrequencyDelta);
  const parsedEffectGoalFrequencyDelta = parseAdminNumberInput(effectGoalFrequencyDelta);
  const parsedEffectShotZoneMultiplier = parseAdminNumberInput(effectShotZoneMultiplier);
  const parsedEffectStumbleIntervalMinRolls = parseAdminNumberInput(effectStumbleIntervalMinRolls);
  const parsedEffectStumbleIntervalMaxRolls = parseAdminNumberInput(effectStumbleIntervalMaxRolls);
  const parsedEffectStumbleDurationMinMs = parseAdminIntegerInput(effectStumbleDurationMinMs);
  const parsedEffectStumbleDurationMaxMs = parseAdminIntegerInput(effectStumbleDurationMaxMs);
  const parsedEffectStumbleOffsetMinPx = parseAdminIntegerInput(effectStumbleOffsetMinPx);
  const parsedEffectStumbleOffsetMaxPx = parseAdminIntegerInput(effectStumbleOffsetMaxPx);
  const parsedEffectStumbleRecoveryMinMs = parseAdminIntegerInput(effectStumbleRecoveryMinMs);
  const parsedEffectStumbleRecoveryMaxMs = parseAdminIntegerInput(effectStumbleRecoveryMaxMs);
  const parsedEffectEnergyBaselineSpeed = parseAdminNumberInput(effectEnergyBaselineSpeed);
  const parsedEffectFatigueGraceMs = parseAdminIntegerInput(effectFatigueGraceMs);
  const parsedEffectFatigueSlowdownStartMs = parseAdminIntegerInput(effectFatigueSlowdownStartMs);
  const parsedEffectFatigueHeavySlowdownStartMs = parseAdminIntegerInput(
    effectFatigueHeavySlowdownStartMs,
  );
  const parsedEffectFatigueStopStartMs = parseAdminIntegerInput(effectFatigueStopStartMs);
  const parsedEffectFatigueStopDurationMs = parseAdminIntegerInput(effectFatigueStopDurationMs);
  const parsedEffectFatigueAfterRestMs = parseAdminIntegerInput(effectFatigueAfterRestMs);
  const parsedEffectFatigueSlowMultiplier = parseAdminNumberInput(effectFatigueSlowMultiplier);
  const parsedEffectFatigueHeavyMultiplier = parseAdminNumberInput(effectFatigueHeavyMultiplier);
  const mutation = useMutation({
    mutationFn: async () => {
      const body: Required<AdminInventoryItemPatch> = {
        photoUrl,
        title,
        description,
        priceRub: parsedPriceRub,
      };
      const gameplay: Required<AdminInventoryGameplayPatch> = {
        itemKind,
        currencyPrice: parsedCurrencyPrice,
        chargesPerPurchase: inventoryChargeValueForSave(itemKind, parsedChargesPerPurchase),
        lowStockThreshold: parsedLowStockThreshold,
        duelPeriodCost: parsedDuelPeriodCost,
        powerScore:
          itemKind === 'stick'
            ? Math.max(0, Math.round(parsedEffectPuckSpeedPoints))
            : (item?.powerScore ?? 0),
        resourceUnit: inventoryResourceUnitForKind(itemKind),
        effectPuckSpeedPoints: Math.round(parsedEffectPuckSpeedPoints),
        effectPuckSpeedDelta: puckSpeedPointsToDelta(effectPuckSpeedPoints),
        effectShooterFrequencyDelta: parsedEffectShooterFrequencyDelta,
        effectGoalieFrequencyDelta: parsedEffectGoalieFrequencyDelta,
        effectGoalFrequencyDelta: parsedEffectGoalFrequencyDelta,
        effectShotZoneMultiplier: parsedEffectShotZoneMultiplier,
        effectStumbleIntervalMinRolls: parsedEffectStumbleIntervalMinRolls,
        effectStumbleIntervalMaxRolls: parsedEffectStumbleIntervalMaxRolls,
        effectStumbleIntervalMinMs: item?.effectStumbleIntervalMinMs ?? 25_000,
        effectStumbleIntervalMaxMs: item?.effectStumbleIntervalMaxMs ?? 45_000,
        effectStumbleDurationMinMs: parsedEffectStumbleDurationMinMs,
        effectStumbleDurationMaxMs: parsedEffectStumbleDurationMaxMs,
        effectStumbleOffsetMinPx: parsedEffectStumbleOffsetMinPx,
        effectStumbleOffsetMaxPx: parsedEffectStumbleOffsetMaxPx,
        effectStumbleRecoveryMinMs: parsedEffectStumbleRecoveryMinMs,
        effectStumbleRecoveryMaxMs: parsedEffectStumbleRecoveryMaxMs,
        effectEnergyBaselineSpeed: parsedEffectEnergyBaselineSpeed,
        effectNutritionSlowdownMs: item?.effectNutritionSlowdownMs ?? 0,
        effectNutritionStopMs: item?.effectNutritionStopMs ?? 0,
        effectFatigueDelayMs: item?.effectFatigueDelayMs ?? 90_000,
        effectFatigueSpeedMultiplier: item?.effectFatigueSpeedMultiplier ?? 1,
        effectFatigueGraceMs: parsedEffectFatigueGraceMs,
        effectFatigueSlowdownStartMs: parsedEffectFatigueSlowdownStartMs,
        effectFatigueHeavySlowdownStartMs: parsedEffectFatigueHeavySlowdownStartMs,
        effectFatigueStopStartMs: parsedEffectFatigueStopStartMs,
        effectFatigueStopDurationMs: parsedEffectFatigueStopDurationMs,
        effectFatigueAfterRestMs: parsedEffectFatigueAfterRestMs,
        effectFatigueSlowMultiplier: parsedEffectFatigueSlowMultiplier,
        effectFatigueHeavyMultiplier: parsedEffectFatigueHeavyMultiplier,
      };
      const saved =
        item === null
          ? await createAdminInventoryItem(body)
          : await patchAdminInventoryItem(item.id, body);
      await patchAdminInventoryGameplay(saved.item.id, gameplay);
      return saved;
    },
    onSuccess: onSaved,
  });
  const handleItemKindChange = (nextKind: AdminInventoryItemKind) => {
    setLowStockThreshold((current) =>
      current === fieldNumber(inventoryLowStockDefault(itemKind))
        ? fieldNumber(inventoryLowStockDefault(nextKind))
        : current,
    );
    setItemKind(nextKind);
  };
  const numericValues = [
    parsedPriceRub,
    parsedCurrencyPrice,
    parsedChargesPerPurchase,
    parsedLowStockThreshold,
    parsedDuelPeriodCost,
    parsedEffectPuckSpeedPoints,
    parsedEffectShooterFrequencyDelta,
    parsedEffectGoalieFrequencyDelta,
    parsedEffectGoalFrequencyDelta,
    parsedEffectShotZoneMultiplier,
    parsedEffectStumbleIntervalMinRolls,
    parsedEffectStumbleIntervalMaxRolls,
    parsedEffectStumbleDurationMinMs,
    parsedEffectStumbleDurationMaxMs,
    parsedEffectStumbleOffsetMinPx,
    parsedEffectStumbleOffsetMaxPx,
    parsedEffectStumbleRecoveryMinMs,
    parsedEffectStumbleRecoveryMaxMs,
    parsedEffectEnergyBaselineSpeed,
    parsedEffectFatigueGraceMs,
    parsedEffectFatigueSlowdownStartMs,
    parsedEffectFatigueHeavySlowdownStartMs,
    parsedEffectFatigueStopStartMs,
    parsedEffectFatigueStopDurationMs,
    parsedEffectFatigueAfterRestMs,
    parsedEffectFatigueSlowMultiplier,
    parsedEffectFatigueHeavyMultiplier,
  ];
  const canSave =
    title.trim() !== '' &&
    numericValues.every(Number.isFinite) &&
    parsedPriceRub >= 0 &&
    parsedCurrencyPrice >= 0 &&
    parsedChargesPerPurchase >= 0 &&
    parsedLowStockThreshold >= 0 &&
    parsedDuelPeriodCost >= 0 &&
    parsedEffectShotZoneMultiplier >= 1 &&
    parsedEffectPuckSpeedPoints >= -500 &&
    parsedEffectPuckSpeedPoints <= 500 &&
    parsedEffectStumbleIntervalMaxRolls >= parsedEffectStumbleIntervalMinRolls &&
    parsedEffectStumbleDurationMaxMs >= parsedEffectStumbleDurationMinMs &&
    parsedEffectStumbleOffsetMaxPx >= parsedEffectStumbleOffsetMinPx &&
    parsedEffectStumbleRecoveryMaxMs >= parsedEffectStumbleRecoveryMinMs &&
    parsedEffectEnergyBaselineSpeed > 0 &&
    parsedEffectFatigueStopStartMs >= parsedEffectFatigueSlowdownStartMs &&
    parsedEffectFatigueAfterRestMs >= 0 &&
    parsedEffectFatigueSlowMultiplier >= 0 &&
    parsedEffectFatigueSlowMultiplier <= 1 &&
    parsedEffectFatigueHeavyMultiplier >= 0 &&
    parsedEffectFatigueHeavyMultiplier <= 1;
  const isStickItem = itemKind === 'stick';
  const isSkatesItem = itemKind === 'skates';
  const isNutritionItem = itemKind === 'nutrition';
  const editorIntro = isStickItem
    ? 'Скорость шайбы: 10 пунктов = +0.10.'
    : isSkatesItem
      ? 'Коньки расходуются в прокатах и управляют спотыканием без рабочего инвентаря.'
      : isNutritionItem
        ? 'Энергия задаётся в минутах, расход зависит от скорости игрока.'
        : 'Базовые параметры расходуемого предмета.';

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={item === null ? 'Новый предмет' : 'Редактирование предмета'}
      style={{
        zIndex: 1000,
        padding: 'calc(12px + var(--app-safe-top)) 12px calc(12px + var(--app-safe-bottom))',
      }}
    >
      <section
        className="modal-card"
        style={{
          width: 'min(520px, calc(100vw - 24px))',
          maxHeight: '100%',
          overflowY: 'auto',
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title">
              {item === null ? 'Новый предмет' : 'Редактирование предмета'}
            </div>
            <div
              className="modal-copy"
              style={{ marginTop: 4, fontSize: 11, fontWeight: 520, lineHeight: 1.22 }}
            >
              {editorIntro}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Закрыть"
            onClick={onCancel}
            style={{ flex: '0 0 34px' }}
          >
            <X size={15} />
          </button>
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
            type="text"
            inputMode="numeric"
            value={priceRub}
            onChange={(event) => setPriceRub(event.target.value)}
          />
        </AdminField>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <AdminField label="Тип">
            <GlassSelect
              value={itemKind}
              options={inventoryItemKindOptions}
              onChange={handleItemKindChange}
              ariaLabel="Тип предмета"
            />
          </AdminField>
          <AdminField label="Цена в валюте">
            <input
              type="text"
              inputMode="numeric"
              value={currencyPrice}
              onChange={(event) => setCurrencyPrice(event.target.value)}
            />
          </AdminField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <AdminField
            label={
              isStickItem
                ? 'Бросков при покупке'
                : isNutritionItem
                  ? 'Минут энергии при покупке'
                  : isSkatesItem
                    ? 'Прокатов при покупке'
                    : 'Зарядов при покупке'
            }
          >
            <div style={adminInventoryFieldBodyStyle}>
              <input
                type="text"
                inputMode="decimal"
                value={chargesPerPurchase}
                onChange={(event) => setChargesPerPurchase(event.target.value)}
              />
              <span style={adminInventoryHintStyle}>
                {isNutritionItem
                  ? 'Редактируется в минутах, в базе хранится в миллисекундах.'
                  : isSkatesItem
                    ? 'Один прокат — движение игрока от одного борта до другого.'
                    : 'Сколько ресурса игрок получает после покупки предмета.'}
              </span>
            </div>
          </AdminField>
          <AdminField label="Расход за период">
            <div style={adminInventoryFieldBodyStyle}>
              <input
                type="text"
                inputMode="numeric"
                value={duelPeriodCost}
                onChange={(event) => setDuelPeriodCost(event.target.value)}
              />
              <span style={adminInventoryHintStyle}>
                {isStickItem ? 'Клюшка: 0, списание 1/бросок.' : ' '}
              </span>
            </div>
          </AdminField>
          <AdminField label="Порог пульсации">
            <div style={adminInventoryFieldBodyStyle}>
              <input
                type="text"
                inputMode="numeric"
                value={lowStockThreshold}
                onChange={(event) => setLowStockThreshold(event.target.value)}
              />
              <span style={adminInventoryHintStyle}>
                Когда остаток станет не больше этого числа, иконка начнёт пульсировать.
              </span>
            </div>
          </AdminField>
        </div>
        {isStickItem && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <AdminField label="Шайба +пункты">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectPuckSpeedPoints}
                    onChange={(event) => setEffectPuckSpeedPoints(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Для клюшки это скорость шайбы: 25 = +0.25 к скорости.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Игрок Δ">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectShooterFrequencyDelta}
                    onChange={(event) => setEffectShooterFrequencyDelta(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle} aria-hidden="true">
                    {' '}
                  </span>
                </div>
              </AdminField>
              <AdminField label="Вратарь Δ">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectGoalieFrequencyDelta}
                    onChange={(event) => setEffectGoalieFrequencyDelta(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle} aria-hidden="true">
                    {' '}
                  </span>
                </div>
              </AdminField>
              <AdminField label="Ворота Δ">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectGoalFrequencyDelta}
                    onChange={(event) => setEffectGoalFrequencyDelta(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle} aria-hidden="true">
                    {' '}
                  </span>
                </div>
              </AdminField>
            </div>
            <AdminField label="Множитель зоны броска">
              <input
                type="text"
                inputMode="decimal"
                value={effectShotZoneMultiplier}
                onChange={(event) => setEffectShotZoneMultiplier(event.target.value)}
              />
            </AdminField>
          </>
        )}
        {isSkatesItem && (
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ink)' }}>
              Коньки и спотыкание
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 12,
                rowGap: 14,
              }}
            >
              <AdminField label="Мин. интервал спотыкания">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectStumbleIntervalMinRolls}
                    onChange={(event) => setEffectStumbleIntervalMinRolls(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Минимум прокатов до следующего спотыкания без рабочих коньков.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Макс. интервал спотыкания">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectStumbleIntervalMaxRolls}
                    onChange={(event) => setEffectStumbleIntervalMaxRolls(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Максимум прокатов до спотыкания. Больше — спотыкается реже.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Мин. длительность, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectStumbleDurationMinMs}
                    onChange={(event) => setEffectStumbleDurationMinMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Минимальное время потери равновесия. В это время бросок заблокирован.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Макс. длительность, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectStumbleDurationMaxMs}
                    onChange={(event) => setEffectStumbleDurationMaxMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>Максимальное время потери равновесия.</span>
                </div>
              </AdminField>
              <AdminField label="Мин. снос позиции, px">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectStumbleOffsetMinPx}
                    onChange={(event) => setEffectStumbleOffsetMinPx(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Сейчас боковой рывок отключён: спотыкание сбивает тайминг короткой заминкой.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Макс. снос позиции, px">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectStumbleOffsetMaxPx}
                    onChange={(event) => setEffectStumbleOffsetMaxPx(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Поле сохранено для совместимости; текущая механика не двигает игрока рывком.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Мин. восстановление, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectStumbleRecoveryMinMs}
                    onChange={(event) => setEffectStumbleRecoveryMinMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Минимальное дополнительное время заминки после основной потери равновесия.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Макс. восстановление, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectStumbleRecoveryMaxMs}
                    onChange={(event) => setEffectStumbleRecoveryMaxMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Максимальное дополнительное время, пока бросок ещё заблокирован.
                  </span>
                </div>
              </AdminField>
            </div>
          </section>
        )}
        {isNutritionItem && (
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ink)' }}>
              Энергия и усталость
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 12,
                rowGap: 14,
              }}
            >
              <AdminField label="Базовая скорость энергии">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectEnergyBaselineSpeed}
                    onChange={(event) => setEffectEnergyBaselineSpeed(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Скорость, при которой энергия тратится 1 к 1. Выше — расход быстрее.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Отсрочка усталости, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectFatigueGraceMs}
                    onChange={(event) => setEffectFatigueGraceMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Сколько можно играть без энергии до первых штрафов.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Начало усталости, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectFatigueSlowdownStartMs}
                    onChange={(event) => setEffectFatigueSlowdownStartMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    После этого времени без энергии игрок замедляется один раз.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Сильная усталость, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectFatigueHeavySlowdownStartMs}
                    onChange={(event) => setEffectFatigueHeavySlowdownStartMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Поле совместимости. Сейчас в дуэлях не влияет на скорость.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Остановка на отдых, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectFatigueStopStartMs}
                    onChange={(event) => setEffectFatigueStopStartMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Когда игрок полностью останавливается и не может бросать.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Длительность отдыха, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectFatigueStopDurationMs}
                    onChange={(event) => setEffectFatigueStopDurationMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Сколько длится принудительный отдых без броска.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Нормальное окно после отдыха, мс">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={effectFatigueAfterRestMs}
                    onChange={(event) => setEffectFatigueAfterRestMs(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Сколько после отдыха игрок едет нормально, если энергия всё ещё закончилась.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Скорость при усталости">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectFatigueSlowMultiplier}
                    onChange={(event) => setEffectFatigueSlowMultiplier(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Множитель скорости. 0.9 значит 90% обычной скорости.
                  </span>
                </div>
              </AdminField>
              <AdminField label="Скорость при сильной усталости">
                <div style={adminInventoryFieldBodyStyle}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={effectFatigueHeavyMultiplier}
                    onChange={(event) => setEffectFatigueHeavyMultiplier(event.target.value)}
                  />
                  <span style={adminInventoryHintStyle}>
                    Поле совместимости. Сейчас в дуэлях не применяется.
                  </span>
                </div>
              </AdminField>
            </div>
          </section>
        )}
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
            Сохранить
          </button>
        </div>
        {mutation.isError && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            {mutation.error instanceof Error ? mutation.error.message : 'Ошибка сохранения'}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function AchievementsAdminPanel({
  loading,
  achievements,
  onChanged,
}: {
  loading: boolean;
  achievements: AdminAchievement[];
  onChanged: () => void;
}): JSX.Element {
  const [sectionTab, setSectionTab] = useState<AdminAchievementsTab>('achievements');
  const [category, setCategory] = useState<AdminAchievementCategory | 'all'>('all');
  const [availability, setAvailability] = useState<AdminAchievementAvailability | 'all'>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = achievements.filter((achievement) => {
    if (category !== 'all' && achievement.category !== category) return false;
    if (availability !== 'all' && achievement.availability !== availability) return false;
    if (normalizedQuery.length === 0) return true;
    return (
      achievement.title.toLowerCase().includes(normalizedQuery) ||
      achievement.id.toLowerCase().includes(normalizedQuery) ||
      achievement.requirement.toLowerCase().includes(normalizedQuery)
    );
  });
  const futureCount = achievements.filter(
    (achievement) => achievement.availability === 'future',
  ).length;
  const activeCount = achievements.filter(
    (achievement) => achievement.availability === 'active',
  ).length;

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <SegmentedTabs
          items={adminAchievementsTabs}
          activeTab={sectionTab}
          ariaLabel="Раздел заданий"
          onChange={setSectionTab}
        />
      </div>
      {sectionTab === 'challenges' && <WeeklyChallengesAdmin />}
      {sectionTab === 'achievements' && (
        <>
          <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
            Задания
          </div>
          <section className="glass" style={{ borderRadius: 20, padding: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <AdminMetric label="Всего" value={achievements.length} />
              <AdminMetric label="Активных" value={activeCount} />
              <AdminMetric label="Future" value={futureCount} />
            </div>
            <div
              style={{
                marginTop: 12,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 0.8fr)',
                gap: 8,
              }}
            >
              <input
                type="search"
                placeholder="Поиск по заданию"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <GlassSelect
                value={category}
                options={[{ value: 'all', label: 'Все категории' }, ...achievementCategoryOptions]}
                onChange={(value) => setCategory(value as AdminAchievementCategory | 'all')}
                ariaLabel="Категория заданий"
              />
              <GlassSelect
                value={availability}
                options={[
                  { value: 'all', label: 'Все статусы' },
                  ...achievementAvailabilityOptions,
                ]}
                onChange={(value) => setAvailability(value as AdminAchievementAvailability | 'all')}
                ariaLabel="Статус заданий"
              />
            </div>
          </section>
          {loading && <AdminPlainState>Загрузка...</AdminPlainState>}
          {!loading && filtered.length === 0 && (
            <AdminPlainState>Под такие фильтры заданий не нашлось.</AdminPlainState>
          )}
          <section style={{ display: 'grid', gap: 10 }}>
            {filtered.map((achievement) => (
              <AchievementAdminCard
                key={achievement.id}
                achievement={achievement}
                onChanged={onChanged}
              />
            ))}
          </section>
        </>
      )}
    </>
  );
}

function AchievementAdminCard({
  achievement,
  onChanged,
}: {
  achievement: AdminAchievement;
  onChanged: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState({
    title: achievement.title,
    description: achievement.description,
    requirement: achievement.requirement,
    photoUrl: achievement.photoUrl,
    category: achievement.category,
    availability: achievement.availability,
    futureTag: achievement.futureTag ?? 'none',
    rewardCurrency: String(achievement.rewardCurrency),
    rewardStars: String(achievement.rewardStars),
    rewardExperience: String(achievement.rewardExperience),
    sortOrder: String(achievement.sortOrder),
  });

  useEffect(() => {
    setDraft({
      title: achievement.title,
      description: achievement.description,
      requirement: achievement.requirement,
      photoUrl: achievement.photoUrl,
      category: achievement.category,
      availability: achievement.availability,
      futureTag: achievement.futureTag ?? 'none',
      rewardCurrency: String(achievement.rewardCurrency),
      rewardStars: String(achievement.rewardStars),
      rewardExperience: String(achievement.rewardExperience),
      sortOrder: String(achievement.sortOrder),
    });
  }, [achievement]);

  const rewardCurrency = Number(draft.rewardCurrency);
  const rewardStars = Number(draft.rewardStars);
  const rewardExperience = Number(draft.rewardExperience);
  const sortOrder = Number(draft.sortOrder);
  const validNumbers = [rewardCurrency, rewardStars, rewardExperience, sortOrder].every(
    (value) => Number.isFinite(value) && value >= 0,
  );
  const patch = useMemo<AdminAchievementPatch>(() => {
    const body: AdminAchievementPatch = {};
    if (draft.title !== achievement.title) body.title = draft.title;
    if (draft.description !== achievement.description) body.description = draft.description;
    if (draft.requirement !== achievement.requirement) body.requirement = draft.requirement;
    if (draft.photoUrl !== achievement.photoUrl) body.photoUrl = draft.photoUrl;
    if (draft.category !== achievement.category) body.category = draft.category;
    if (draft.availability !== achievement.availability) body.availability = draft.availability;
    const futureTag = draft.futureTag === 'none' ? null : draft.futureTag;
    if (futureTag !== achievement.futureTag) {
      body.futureTag = futureTag as AdminAchievementFutureTag | null;
    }
    if (rewardCurrency !== achievement.rewardCurrency)
      body.rewardCurrency = Math.trunc(rewardCurrency);
    if (rewardStars !== achievement.rewardStars) body.rewardStars = Math.trunc(rewardStars);
    if (rewardExperience !== achievement.rewardExperience) {
      body.rewardExperience = Math.trunc(rewardExperience);
    }
    if (sortOrder !== achievement.sortOrder) body.sortOrder = Math.trunc(sortOrder);
    return body;
  }, [achievement, draft, rewardCurrency, rewardExperience, rewardStars, sortOrder]);
  const dirty = Object.keys(patch).length > 0;
  const unclaimedCount = Math.max(0, achievement.completedCount - achievement.claimedCount);
  const mutation = useMutation({
    mutationFn: () => patchAdminAchievement(achievement.id, patch),
    onSuccess: onChanged,
  });

  return (
    <article className="glass" style={{ borderRadius: 20, padding: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '58px minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <img
          src={achievement.photoUrl}
          alt=""
          width={58}
          height={58}
          style={{ borderRadius: 8, objectFit: 'cover', background: 'rgba(255,255,255,0.5)' }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>
            {achievement.title}
          </div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
            {achievement.id} · выполнено {numberText(achievement.completedCount)} · получено{' '}
            {numberText(achievement.claimedCount)}
          </div>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn--dark"
          onClick={() => mutation.mutate()}
          disabled={!dirty || !validNumbers || mutation.isPending}
          title="Сохранить"
          aria-label={`Сохранить ${achievement.title}`}
          style={{
            width: 42,
            height: 42,
            opacity: dirty && validNumbers ? 1 : 0.52,
            cursor: dirty && validNumbers ? 'pointer' : 'not-allowed',
          }}
        >
          <Save size={17} />
        </button>
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        <AdminMetric label="Выполнили игроков" value={achievement.completedCount} />
        <AdminMetric label="Получили награду" value={achievement.claimedCount} />
        <AdminMetric label="Ждут награду" value={unclaimedCount} />
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <AdminField label="Название">
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </AdminField>
        <AdminField label="Картинка">
          <input
            value={draft.photoUrl}
            onChange={(event) =>
              setDraft((current) => ({ ...current, photoUrl: event.target.value }))
            }
          />
        </AdminField>
        <AdminField label="Описание">
          <input
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
        </AdminField>
        <AdminField label="Условие">
          <input
            value={draft.requirement}
            onChange={(event) =>
              setDraft((current) => ({ ...current, requirement: event.target.value }))
            }
          />
        </AdminField>
        <AdminField label="Категория">
          <GlassSelect
            value={draft.category}
            options={achievementCategoryOptions}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                category: value as AdminAchievementCategory,
              }))
            }
            ariaLabel={`Категория ${achievement.title}`}
          />
        </AdminField>
        <AdminField label="Доступность">
          <GlassSelect
            value={draft.availability}
            options={achievementAvailabilityOptions}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                availability: value as AdminAchievementAvailability,
              }))
            }
            ariaLabel={`Доступность ${achievement.title}`}
          />
        </AdminField>
        <AdminField label="Future tag">
          <GlassSelect
            value={draft.futureTag}
            options={achievementFutureTagOptions}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                futureTag: value as AdminAchievementFutureTag | 'none',
              }))
            }
            ariaLabel={`Future tag ${achievement.title}`}
          />
        </AdminField>
        <AdminField label="Порядок">
          <input
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sortOrder: event.target.value }))
            }
          />
        </AdminField>
        <AdminField label="Монеты">
          <input
            type="number"
            min={0}
            value={draft.rewardCurrency}
            onChange={(event) =>
              setDraft((current) => ({ ...current, rewardCurrency: event.target.value }))
            }
          />
        </AdminField>
        <AdminField label="Звезды">
          <input
            type="number"
            min={0}
            value={draft.rewardStars}
            onChange={(event) =>
              setDraft((current) => ({ ...current, rewardStars: event.target.value }))
            }
          />
        </AdminField>
        <AdminField label="Опыт">
          <input
            type="number"
            min={0}
            value={draft.rewardExperience}
            onChange={(event) =>
              setDraft((current) => ({ ...current, rewardExperience: event.target.value }))
            }
          />
        </AdminField>
      </div>
      {mutation.isError && (
        <div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>
          {mutation.error instanceof Error ? mutation.error.message : 'Ошибка сохранения'}
        </div>
      )}
    </article>
  );
}

function makeDefaultDuelPresets(totalPeriods: number): AdminDuelPeriodSpeedPreset[] {
  return Array.from({ length: totalPeriods }, (_, index) => ({
    periodNumber: index + 1,
    goalFrequency: index === 0 ? 0.55 : index === 1 ? 0.72 : 0.9,
    goalieFrequency: index === 0 ? 0.65 : index === 1 ? 0.84 : 1.05,
    shooterFrequency: index === 0 ? 0.8 : index === 1 ? 1 : 1.18,
    puckSpeedPerMs: index === 0 ? 1.3 : index === 1 ? 1.55 : 1.8,
  }));
}

const duelSpeedFields: Array<{
  key: Exclude<keyof AdminDuelPeriodSpeedPreset, 'periodNumber'>;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'goalFrequency', label: 'Скорость ворот', min: 0.1, max: 3, step: 0.01 },
  { key: 'goalieFrequency', label: 'Скорость вратаря', min: 0.1, max: 3, step: 0.01 },
  { key: 'shooterFrequency', label: 'Скорость игрока', min: 0.1, max: 3, step: 0.01 },
  { key: 'puckSpeedPerMs', label: 'Скорость шайбы', min: 0.2, max: 5, step: 0.01 },
];

function normalizeDuelPresets(
  value: AdminDuelPeriodSpeedPreset[] | undefined,
  totalPeriods: number,
): AdminDuelPeriodSpeedPreset[] {
  const defaults = makeDefaultDuelPresets(totalPeriods);
  return defaults.map((fallback, index) => {
    const existing =
      value?.find((preset) => preset.periodNumber === index + 1) ?? value?.[index] ?? fallback;
    return {
      periodNumber: index + 1,
      goalFrequency: Number.isFinite(existing.goalFrequency)
        ? existing.goalFrequency
        : fallback.goalFrequency,
      goalieFrequency: Number.isFinite(existing.goalieFrequency)
        ? existing.goalieFrequency
        : fallback.goalieFrequency,
      shooterFrequency: Number.isFinite(existing.shooterFrequency)
        ? existing.shooterFrequency
        : fallback.shooterFrequency,
      puckSpeedPerMs: Number.isFinite(existing.puckSpeedPerMs)
        ? existing.puckSpeedPerMs
        : fallback.puckSpeedPerMs,
    };
  });
}

function DuelTemplatesPanel({
  loading,
  templates,
  onChanged,
}: {
  loading: boolean;
  templates: AdminDuelTemplate[];
  onChanged: () => void;
}): JSX.Element {
  const [duelView, setDuelView] = useState<'templates' | 'history'>('templates');
  const [editingTemplate, setEditingTemplate] = useState<AdminDuelTemplate | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDuelTemplate | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => deleteAdminDuelTemplate(templateId),
    onSuccess: () => {
      setDeleteTarget(null);
      onChanged();
    },
  });

  return (
    <>
      <SegmentedTabs
        items={[
          { id: 'templates', label: 'Шаблоны' },
          { id: 'history', label: 'История' },
        ]}
        activeTab={duelView}
        ariaLabel="Раздел дуэлей"
        onChange={setDuelView}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          {duelView === 'templates'
            ? `Шаблоны дуэлей (${numberText(templates.length)})`
            : 'История дуэлей'}
        </div>
        {duelView === 'templates' && (
          <button
            type="button"
            className="chip chip--active"
            onClick={() => setEditingTemplate('new')}
            style={{ padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}
          >
            <Plus size={14} />
            Создать
          </button>
        )}
      </div>
      {editingTemplate !== null && (
        <DuelTemplateEditor
          template={editingTemplate === 'new' ? null : editingTemplate}
          onCancel={() => setEditingTemplate(null)}
          onSaved={() => {
            setEditingTemplate(null);
            onChanged();
          }}
        />
      )}
      {duelView === 'templates' ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <AdminPlainState>Загрузка шаблонов...</AdminPlainState>}
          {!loading && templates.length === 0 && (
            <AdminPlainState>Шаблонов пока нет</AdminPlainState>
          )}
          {templates.map((template) => (
            <DuelTemplateCard
              key={template.id}
              template={template}
              onEdit={() => setEditingTemplate(template)}
              onDelete={() => setDeleteTarget(template)}
            />
          ))}
        </section>
      ) : (
        <DuelHistoryPanel />
      )}
      {deleteTarget !== null && (
        <ConfirmAction
          title="Удалить шаблон"
          text={`Шаблон “${deleteTarget.title}” исчезнет из новых вызовов. Активные матчи продолжат играть по snapshot правил.`}
          confirmLabel="Удалить"
          pending={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </>
  );
}

function DuelTemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: AdminDuelTemplate;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const isAlwaysAvailable = new Date(template.endsAt).getFullYear() >= 2099;
  return (
    <article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'start',
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>{template.title}</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>
            {template.description || 'Без описания'}
          </div>
        </div>
        <span
          className={template.isActive ? 'pill pill--dark' : 'pill'}
          style={{ alignSelf: 'start', minHeight: 34, padding: '0 14px', fontSize: 12 }}
        >
          {template.isActive ? 'Активен' : 'Выключен'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <span className="pill" style={{ fontSize: 10 }}>
          {template.totalPeriods} x {template.shotsPerPeriod}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Период {minutesText(msToMinutes(template.periodDurationMs))}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Перерыв {minutesText(msToMinutes(template.breakDurationMs))}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Ответ {minutesText(msToMinutes(template.challengeTtlMs))}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Ожидание {minutesText(msToMinutes(template.readyDurationMs))}
        </span>
        <span className="pill" style={{ fontSize: 10 }}>
          Победа {numberText(template.winPoints)} очк. ·{' '}
          <span style={{ color: rewardColor('coin') }}>
            {numberText(template.winCurrencyReward)} шайб
          </span>
        </span>
        {template.winStarReward > 0 && (
          <span className="pill" style={{ fontSize: 10, color: rewardColor('star') }}>
            Победа {numberText(template.winStarReward)} звёзд
          </span>
        )}
        <span className="pill" style={{ fontSize: 10 }}>
          Ничья {numberText(template.drawPoints)} очк. ·{' '}
          <span style={{ color: rewardColor('coin') }}>
            {numberText(template.drawCurrencyReward)} шайб
          </span>
        </span>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
        {isAlwaysAvailable
          ? `Доступен всегда, с ${dateTimeText(template.startsAt)}`
          : `Окно: ${dateTimeText(template.startsAt)} - ${dateTimeText(template.endsAt)}`}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          className="icon-btn"
          onClick={onEdit}
          title="Редактировать"
          aria-label={`Редактировать ${template.title}`}
          style={{ width: 40, height: 40 }}
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onDelete}
          title="Удалить"
          aria-label={`Удалить ${template.title}`}
          style={{ width: 40, height: 40 }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

const duelHistoryStatusOptions: Array<GlassSelectOption<AdminDuelHistoryItem['status'] | 'all'>> = [
  { value: 'all', label: 'Все статусы' },
  { value: 'invited', label: 'Вызов' },
  { value: 'ready_check', label: 'Ожидание' },
  { value: 'active', label: 'Игра' },
  { value: 'settled', label: 'Завершена' },
  { value: 'cancelled', label: 'Отменена' },
  { value: 'expired', label: 'Истекла' },
];

function dayStartIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function dayEndIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function duelStatusLabel(status: AdminDuelHistoryItem['status']): string {
  return duelHistoryStatusOptions.find((option) => option.value === status)?.label ?? status;
}

function duelOutcomeText(duel: AdminDuelHistoryItem): string {
  if (duel.outcome === 'draw') return 'Ничья';
  if (duel.outcome === 'double_loss') return 'Без победителя';
  if (duel.winnerUserId === duel.challenger.userId) return `Победил ${duel.challenger.displayName}`;
  if (duel.winnerUserId === duel.opponent.userId) return `Победил ${duel.opponent.displayName}`;
  return 'Исход пока не определен';
}

function DuelHistoryPanel(): JSX.Element {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AdminDuelHistoryItem['status'] | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(25);
  const debouncedQuery = useDebouncedValue(query, 250);
  const history = useQuery<AdminDuelHistoryResponse>({
    queryKey: ['admin', 'duel-history', debouncedQuery, status, from, to, limit],
    queryFn: () => {
      const params: Parameters<typeof fetchAdminDuelHistory>[0] = {
        q: debouncedQuery,
        status,
        limit,
        offset: 0,
      };
      const fromIso = dayStartIso(from);
      const toIso = dayEndIso(to);
      if (fromIso) params.from = fromIso;
      if (toIso) params.to = toIso;
      return fetchAdminDuelHistory(params);
    },
    staleTime: 20_000,
  });
  const duels = history.data?.duels ?? [];
  const total = history.data?.total ?? 0;

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>
        <div className="search-shell" style={{ minHeight: 42 }}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(25);
            }}
            placeholder="Игрок"
            aria-label="Поиск дуэлей по игроку"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <AdminField label="Статус">
            <GlassSelect
              value={status}
              options={duelHistoryStatusOptions}
              onChange={(value) => {
                setStatus(value);
                setLimit(25);
              }}
              ariaLabel="Статус дуэли"
            />
          </AdminField>
          <AdminField label="С даты">
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setLimit(25);
              }}
            />
          </AdminField>
          <AdminField label="По дату">
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setLimit(25);
              }}
            />
          </AdminField>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setQuery('');
              setStatus('all');
              setFrom('');
              setTo('');
              setLimit(25);
            }}
            style={{ alignSelf: 'end', padding: 12, fontSize: 12, letterSpacing: 0 }}
          >
            Сбросить
          </button>
        </div>
      </div>
      {history.isLoading && <AdminPlainState>Загрузка дуэлей...</AdminPlainState>}
      {!history.isLoading && duels.length === 0 && (
        <AdminPlainState>Дуэлей не найдено</AdminPlainState>
      )}
      {duels.map((duel) => (
        <article key={duel.id} className="glass" style={{ borderRadius: 18, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>
                {duel.templateTitle}
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
                {dateTimeText(duel.createdAt)} · {duelStatusLabel(duel.status)}
              </div>
            </div>
            <span className="pill pill--dark" style={{ whiteSpace: 'nowrap' }}>
              {duel.challenger.goals}:{duel.opponent.goals}
            </span>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            <DuelHistoryParticipantRow participant={duel.challenger} />
            <DuelHistoryParticipantRow participant={duel.opponent} />
          </div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
            {duelOutcomeText(duel)}
            {duel.settledReason ? ` · ${duel.settledReason}` : ''}
          </div>
        </article>
      ))}
      {duels.length < total && (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setLimit((value) => value + 25)}
          disabled={history.isFetching}
          style={{ padding: 12, fontSize: 12, letterSpacing: 0 }}
        >
          Загрузить еще {numberText(Math.min(25, total - duels.length))}
        </button>
      )}
    </section>
  );
}

function DuelHistoryParticipantRow({
  participant,
}: {
  participant: AdminDuelHistoryItem['challenger'];
}): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div style={{ minWidth: 0, color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>
        {participant.displayName}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
        {numberText(participant.goals)} голов · {numberText(participant.shots)} бросков ·{' '}
        {numberText(participant.resultPoints)} очк.
      </div>
    </div>
  );
}

function DuelTemplateEditor({
  template,
  onCancel,
  onSaved,
}: {
  template: AdminDuelTemplate | null;
  onCancel: () => void;
  onSaved: () => void;
}): JSX.Element {
  const editorRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const defaultStartsAt = new Date().toISOString();
  const defaultEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const [title, setTitle] = useState(template?.title ?? 'Классическая дуэль');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [matchmakingVenuePolicy, setMatchmakingVenuePolicy] = useState<AdminMatchmakingVenuePolicy>(
    template?.matchmakingVenuePolicy ?? 'neutral_default',
  );
  const [duelKind] = useState(template?.duelKind ?? 'classic');
  const [duelVariant] = useState(template?.duelVariant ?? 'classic');
  const [startsAt, setStartsAt] = useState(
    dateTimeInputValue(template?.startsAt ?? defaultStartsAt),
  );
  const [endsAt, setEndsAt] = useState(dateTimeInputValue(template?.endsAt ?? defaultEndsAt));
  const [totalPeriods, setTotalPeriods] = useState(fieldNumber(template?.totalPeriods ?? 3));
  const [shotsPerPeriod, setShotsPerPeriod] = useState(fieldNumber(template?.shotsPerPeriod ?? 30));
  const [periodMinutes, setPeriodMinutes] = useState(
    fieldNumber(template ? msToMinutes(template.periodDurationMs) : 20),
  );
  const [breakMinutes, setBreakMinutes] = useState(
    fieldNumber(template ? msToMinutes(template.breakDurationMs) : 15),
  );
  const [challengeMinutes, setChallengeMinutes] = useState(
    fieldNumber(template ? msToMinutes(template.challengeTtlMs) : 15),
  );
  const [readyMinutes, setReadyMinutes] = useState(
    fieldNumber(template ? msToMinutes(template.readyDurationMs) : 15),
  );
  const [winPoints, setWinPoints] = useState(fieldNumber(template?.winPoints ?? 3));
  const [drawPoints, setDrawPoints] = useState(fieldNumber(template?.drawPoints ?? 1));
  const [winCurrencyReward, setWinCurrencyReward] = useState(
    fieldNumber(template?.winCurrencyReward ?? 0),
  );
  const [drawCurrencyReward, setDrawCurrencyReward] = useState(
    fieldNumber(template?.drawCurrencyReward ?? 0),
  );
  const [winStarReward, setWinStarReward] = useState(fieldNumber(template?.winStarReward ?? 0));
  const [periodSpeedPresets, setPeriodSpeedPresets] = useState(() =>
    normalizeDuelPresets(
      template?.periodSpeedPresets,
      Math.max(1, Math.trunc(template?.totalPeriods ?? 3)),
    ),
  );
  const numericValues = [
    totalPeriods,
    shotsPerPeriod,
    periodMinutes,
    breakMinutes,
    challengeMinutes,
    readyMinutes,
    winPoints,
    drawPoints,
    winCurrencyReward,
    drawCurrencyReward,
    winStarReward,
  ].map(parseAdminNumberInput);
  const totalPeriodsNumber = parseAdminNumberInput(totalPeriods);
  const totalPeriodsCount = Number.isFinite(totalPeriodsNumber)
    ? Math.max(1, Math.min(9, Math.trunc(totalPeriodsNumber)))
    : 0;
  const startsIso = dateTimeInputToIso(startsAt);
  const endsIso = dateTimeInputToIso(endsAt);
  const speedPresetsForSave = periodSpeedPresets.slice(0, totalPeriodsCount).map(
    (preset, index): AdminDuelPeriodSpeedPreset => ({
      ...preset,
      periodNumber: index + 1,
    }),
  );
  const speedPresetsValid =
    speedPresetsForSave.length === totalPeriodsCount &&
    speedPresetsForSave.every((preset) =>
      duelSpeedFields.every((field) => {
        const value = preset[field.key];
        return Number.isFinite(value) && value >= field.min && value <= field.max;
      }),
    );
  const canSave =
    title.trim() !== '' &&
    numericValues.every(Number.isFinite) &&
    parseAdminNumberInput(totalPeriods) >= 1 &&
    parseAdminNumberInput(shotsPerPeriod) >= 1 &&
    parseAdminNumberInput(periodMinutes) > 0 &&
    parseAdminNumberInput(breakMinutes) >= 0 &&
    parseAdminNumberInput(challengeMinutes) > 0 &&
    parseAdminNumberInput(readyMinutes) > 0 &&
    parseAdminNumberInput(winPoints) >= 0 &&
    parseAdminNumberInput(drawPoints) >= 0 &&
    parseAdminNumberInput(winCurrencyReward) >= 0 &&
    parseAdminNumberInput(drawCurrencyReward) >= 0 &&
    parseAdminNumberInput(winStarReward) >= 0 &&
    new Date(startsIso).getTime() < new Date(endsIso).getTime() &&
    speedPresetsValid;
  useEffect(() => {
    if (totalPeriodsCount <= 0) return;
    setPeriodSpeedPresets((current) => normalizeDuelPresets(current, totalPeriodsCount));
  }, [totalPeriodsCount]);

  useEffect(() => {
    const editor = editorRef.current;
    editor?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancelRef.current();
      if (event.key !== 'Tab' || !editor) return;
      const focusable = Array.from(
        editor.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function updateSpeedPreset(
    periodNumber: number,
    key: Exclude<keyof AdminDuelPeriodSpeedPreset, 'periodNumber'>,
    value: string,
  ): void {
    const nextValue = parseAdminNumberInput(value);
    setPeriodSpeedPresets((current) =>
      current.map((preset) =>
        preset.periodNumber === periodNumber ? { ...preset, [key]: nextValue } : preset,
      ),
    );
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body: AdminDuelTemplateInput = {
        title: title.trim(),
        description: description.trim(),
        isActive,
        duelKind,
        duelVariant,
        rankedEnabled: template?.rankedEnabled ?? true,
        matchmakingEnabled: template?.matchmakingEnabled ?? true,
        matchmakingVenuePolicy,
        startsAt: startsIso,
        endsAt: endsIso,
        totalPeriods: parseAdminNumberInput(totalPeriods),
        shotsPerPeriod: parseAdminNumberInput(shotsPerPeriod),
        periodDurationMs: minutesToMs(periodMinutes),
        breakDurationMs: minutesToMs(breakMinutes),
        challengeTtlMs: minutesToMs(challengeMinutes),
        readyDurationMs: minutesToMs(readyMinutes),
        readyNoShowCooldownMs: template?.readyNoShowCooldownMs ?? 900_000,
        matchmakingTimeoutMs: template?.matchmakingTimeoutMs ?? 180_000,
        rankedDailyLimit: template?.rankedDailyLimit ?? 100,
        rankedSameOpponentLimit: template?.rankedSameOpponentLimit ?? 100,
        powerCap: template?.powerCap ?? 100,
        goalieId: template?.goalieId ?? 'rookie',
        periodSpeedPresets: speedPresetsForSave,
        periodRules: null,
        stakeAmount: 0,
        entryFeeAmount: 0,
        requiredInventoryItemId: null,
        inventoryChargesPerPeriod: 0,
        winPoints: parseAdminNumberInput(winPoints),
        drawPoints: parseAdminNumberInput(drawPoints),
        winCurrencyReward: parseAdminNumberInput(winCurrencyReward),
        drawCurrencyReward: parseAdminNumberInput(drawCurrencyReward),
        winStarReward: parseAdminNumberInput(winStarReward),
      };
      return template === null
        ? createAdminDuelTemplate(body)
        : patchAdminDuelTemplate(template.id, body);
    },
    onSuccess: onSaved,
  });

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={template === null ? 'Новый шаблон дуэли' : 'Редактирование дуэли'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{
        zIndex: 1000,
        padding: 'calc(16px + var(--app-safe-top)) 14px calc(16px + var(--app-safe-bottom))',
      }}
    >
      <section
        ref={editorRef}
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: 430,
          maxHeight: '100%',
          overflowY: 'auto',
          borderRadius: 24,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <h2 className="modal-title">
          {template === null ? 'Новый шаблон дуэли' : 'Редактирование дуэли'}
        </h2>
        <p className="modal-copy" style={{ marginTop: 0 }}>
          Площадка и правила сохраняются для новых матчей после подтверждения.
        </p>
        <AdminField label="Название">
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </AdminField>
        <AdminField label="Описание">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            style={{ resize: 'vertical', minHeight: 78, lineHeight: 1.35 }}
          />
        </AdminField>
        <label
          className="glass"
          style={{
            borderRadius: 16,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>Активен</span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            style={{ width: 18, height: 18 }}
          />
        </label>
        <AdminField label="Площадка при автоматическом подборе">
          <GlassSelect
            ariaLabel="Площадка при автоматическом подборе"
            value={matchmakingVenuePolicy}
            options={venueSelectOptions}
            onChange={setMatchmakingVenuePolicy}
          />
        </AdminField>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <AdminField label="Старт">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </AdminField>
          <AdminField label="Финиш">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </AdminField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <AdminField label="Периодов">
            <input
              type="number"
              min="1"
              max="9"
              value={totalPeriods}
              onChange={(event) => setTotalPeriods(event.target.value)}
            />
          </AdminField>
          <AdminField label="Бросков">
            <input
              type="number"
              min="1"
              max="100"
              value={shotsPerPeriod}
              onChange={(event) => setShotsPerPeriod(event.target.value)}
            />
          </AdminField>
          <AdminField label="Минут период">
            <input
              type="number"
              min="1"
              value={periodMinutes}
              onChange={(event) => setPeriodMinutes(event.target.value)}
            />
          </AdminField>
          <AdminField label="Минут перерыв">
            <input
              type="number"
              min="0"
              value={breakMinutes}
              onChange={(event) => setBreakMinutes(event.target.value)}
            />
          </AdminField>
          <AdminField label="Минут на ответ">
            <input
              type="number"
              min="1"
              value={challengeMinutes}
              onChange={(event) => setChallengeMinutes(event.target.value)}
            />
          </AdminField>
          <AdminField label="Минут ожидание">
            <input
              type="number"
              min="1"
              value={readyMinutes}
              onChange={(event) => setReadyMinutes(event.target.value)}
            />
          </AdminField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <AdminField label="Очки за победу">
            <input
              type="number"
              min="0"
              value={winPoints}
              onChange={(event) => setWinPoints(event.target.value)}
            />
          </AdminField>
          <AdminField label="Очки за ничью">
            <input
              type="number"
              min="0"
              value={drawPoints}
              onChange={(event) => setDrawPoints(event.target.value)}
            />
          </AdminField>
          <AdminField label="Валюта за победу">
            <input
              type="number"
              min="0"
              value={winCurrencyReward}
              onChange={(event) => setWinCurrencyReward(event.target.value)}
            />
          </AdminField>
          <AdminField label="Валюта за ничью">
            <input
              type="number"
              min="0"
              value={drawCurrencyReward}
              onChange={(event) => setDrawCurrencyReward(event.target.value)}
            />
          </AdminField>
          <AdminField label="Звёзды за победу">
            <input
              type="number"
              min="0"
              value={winStarReward}
              onChange={(event) => setWinStarReward(event.target.value)}
            />
          </AdminField>
        </div>
        <section
          className="glass"
          style={{
            borderRadius: 18,
            padding: 12,
            display: 'grid',
            gap: 10,
            background: 'rgba(255,255,255,0.34)',
          }}
        >
          <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 950 }}>
            Скорости по периодам
          </div>
          {periodSpeedPresets.slice(0, totalPeriodsCount).map((preset) => (
            <div
              key={preset.periodNumber}
              className="glass"
              style={{
                borderRadius: 16,
                padding: 10,
                display: 'grid',
                gap: 8,
                background: 'rgba(255,255,255,0.42)',
              }}
            >
              <div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 950 }}>
                {preset.periodNumber}-й период
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {duelSpeedFields.map((field) => (
                  <AdminField key={field.key} label={field.label}>
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={preset[field.key]}
                      onChange={(event) =>
                        updateSpeedPreset(preset.periodNumber, field.key, event.target.value)
                      }
                    />
                  </AdminField>
                ))}
              </div>
            </div>
          ))}
        </section>
        {!speedPresetsValid && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            Скорости заполнены некорректно
          </div>
        )}
        <div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
            className="modal-primary btn--cta"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSave}
            style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}
          >
            Сохранить
          </button>
        </div>
        {mutation.isError && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            {mutation.error instanceof Error ? mutation.error.message : 'Ошибка сохранения'}
          </div>
        )}
      </section>
    </div>,
    document.body,
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
    <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>
      {children}
    </label>
  );
}
