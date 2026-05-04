import { apiFetch } from '../api/apiFetch.js';

export type AdminRole = 'player' | 'admin';
export type AdminIdentitySource = 'custom' | 'telegram' | 'vk';
export type AdminLevelFilter = 'all' | 'beginner' | 'amateur' | 'professional';
export type AdminFeedbackKind = 'review' | 'suggestion' | 'question';
export type AdminChannelPeriod = '7d' | '30d' | '90d';
export type AdminDashboardPeriod = '7d' | '30d' | '90d' | '365d';
export type AdminMismatchPeriod = AdminDashboardPeriod;
export type AdminPushNotificationKey =
  | 'chat.new_dialog_message'
  | 'daily.available'
  | 'daily.unlocked_after_training'
  | 'daily.period_ending'
  | 'daily.break_finished'
  | 'training.available'
  | 'news.posted';
export type AdminPushNotificationCategory = 'chat' | 'daily' | 'training' | 'news';
export type AdminPushDeliveryStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'partial'
  | 'failed'
  | 'skipped';
export type AdminSort =
  | 'name_asc'
  | 'name_desc'
  | 'goals_asc'
  | 'goals_desc'
  | 'accuracy_asc'
  | 'accuracy_desc';
export type GameSettingValue = string | number | boolean;

export interface AdminSummary {
  users: { total: number; admins: number; notifications: AdminNotificationStats };
  lifetime: { shots: number; goals: number };
  active: { daily: number; training: number };
  last24h: { shots: number; goals: number; mismatches: number };
  dashboard: AdminDashboard;
  gameCoreVersion: number;
}

export interface AdminDashboardSeriesPoint {
  date: string;
  newUsers: number;
  activeUsers: number;
  revenueRub: number;
  shots: number;
  goals: number;
  messages: number;
}

export interface AdminDashboard {
  period: AdminDashboardPeriod;
  periodDays: number;
  users: {
    total: number;
    admins: number;
    players: number;
    newToday: number;
    new7d: number;
    new30d: number;
    new365d: number;
    newInPeriod: number;
    activeToday: number;
    activeYesterday: number;
    active7d: number;
    active30d: number;
    active365d: number;
    activeInPeriod: number;
    activated: { count: number; percent: number };
  };
  payments: {
    revenueTodayRub: number;
    revenue30dRub: number;
    revenuePeriodRub: number;
    revenueMonthRub: number;
    revenueQuarterRub: number;
    revenueYearRub: number;
    revenueTotalRub: number;
    paidUsersTotal: number;
    paidUsers30d: number;
    paidUsersPeriod: number;
    paidPayments30d: number;
    paidPaymentsPeriod: number;
    payerConversionPercent: number;
    arpu30dRub: number;
    arppu30dRub: number;
    arpuPeriodRub: number;
    arppuPeriodRub: number;
  };
  game: {
    shotsToday: number;
    goalsToday: number;
    shots7d: number;
    goals7d: number;
    shots30d: number;
    goals30d: number;
    shotsPeriod: number;
    goalsPeriod: number;
    shotsTotal: number;
    goalsTotal: number;
    accuracy30d: number;
    accuracyPeriod: number;
    dailyPlayers30d: number;
    trainingPlayers30d: number;
    dailyPlayersPeriod: number;
    trainingPlayersPeriod: number;
    activeDailyPools: number;
    activeTrainingSessions: number;
    mismatches30d: number;
    mismatchesPeriod: number;
  };
  chat: {
    messagesToday: number;
    messages7d: number;
    messages30d: number;
    activeUsers30d: number;
    messagesPeriod: number;
    activeUsersPeriod: number;
  };
  feedback: { total: number; unread: number };
  inventory: { activeItems: number };
  engagement: {
    avgDailyActivitySpanMinutes: number;
    dauWauPercent: number;
    wauMauPercent: number;
  };
  notifications: AdminNotificationStats;
  series: AdminDashboardSeriesPoint[];
}

export interface AdminNotificationStats {
  totalUsers: number;
  subscribed: { count: number; percent: number };
  types: {
    chatNewDialogMessage: { count: number; percent: number };
    dailyGame: { count: number; percent: number };
    trainingAvailable: { count: number; percent: number };
    gameNews: { count: number; percent: number };
  };
}

export interface AdminUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  displaySource: AdminIdentitySource;
  role: AdminRole;
  grip: 'left' | 'right';
  level: number;
  xp: number;
  timezone: string;
  createdAt: string;
  lastSeenAt: string | null;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedBy: string | null;
  blockedByDisplayName: string | null;
  lifetimeShotsTotal: number;
  lifetimeGoalsTotal: number;
  accuracy: number;
  competitionLevel: 'beginner' | 'amateur' | 'professional';
  identities: Array<{
    source: AdminIdentitySource;
    label: string;
    displayName: string;
    avatarUrl: string | null;
    id: string | null;
    username: string | null;
    linked: boolean;
    active: boolean;
  }>;
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
  pushNotifications: {
    subscribed: boolean;
    subscriptionCount: number;
    types: {
      chatNewDialogMessage: boolean;
      dailyGame: boolean;
      trainingAvailable: boolean;
      gameNews: boolean;
    };
  };
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
  notificationStats: AdminNotificationStats;
}

export interface AdminUserDetail {
  user: AdminUser;
  purchaseSummary: { totalRubSpent: number; purchasesCount: number };
  purchases: Array<{
    id: string;
    title: string;
    amountRub: number;
    status: AdminPaymentStatus;
    createdAt: string;
  }>;
  achievements: Array<{
    id: string;
    photoUrl: string;
    title: string;
    description: string;
    requirement: string;
    isUnlocked: boolean;
    unlockedAt?: string;
  }>;
  shotModes: Array<{ mode: string; shots: number; goals: number; lastShotAt: string | null }>;
  events: Array<{ id: string; type: string; payload: unknown; createdAt: string }>;
}

export type AdminPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled';
export type AdminPaymentSort =
  | 'created_desc'
  | 'created_asc'
  | 'amount_desc'
  | 'amount_asc'
  | 'user_asc'
  | 'user_desc';

export interface AdminPayment {
  id: string;
  userId: string | null;
  userDisplayName: string;
  userAvatarUrl: string | null;
  inventoryItemId: string | null;
  title: string;
  amountRub: number;
  status: AdminPaymentStatus;
  provider: string;
  providerPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminPaymentsResponse {
  payments: AdminPayment[];
  total: number;
  limit: number;
  offset: number;
  analytics: {
    month: { revenueRub: number; paidCount: number };
    quarter: { revenueRub: number; paidCount: number };
    year: { revenueRub: number; paidCount: number };
  };
}

export interface AdminInventoryItem {
  id: string;
  photoUrl: string;
  title: string;
  description: string;
  priceRub: number;
  createdAt: string;
  updatedAt: string;
  paymentsCount: number;
  paidRevenueRub: number;
}

export interface AdminFeedback {
  id: string;
  userId: string | null;
  userDisplayName: string;
  userAvatarUrl: string | null;
  kind: AdminFeedbackKind;
  rating: number | null;
  message: string;
  isRead: boolean;
  readAt: string | null;
  readBy: string | null;
  readByDisplayName: string | null;
  createdAt: string;
}

export interface AdminFeedbackQuery {
  kind: 'all' | AdminFeedbackKind;
  status: 'all' | 'unread' | 'read';
}

export interface AdminFeedbackResponse {
  feedback: AdminFeedback[];
  total: number;
  unreadCount: number;
  ratingStats: {
    count: number;
    average: number | null;
  };
  limit: number;
  offset: number;
}

export interface AdminMismatchLog {
  id: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl: string | null;
  createdAt: string;
  mode: string;
  sessionId: string | null;
  shotSessionId: string | null;
  periodNumber: number | null;
  shotIndex: number | null;
  claimedResult: string | null;
  serverResult: string | null;
  gameCoreVersion: number | null;
  payload: unknown;
}

export interface AdminMismatchesResponse {
  period: AdminMismatchPeriod;
  periodDays: number;
  total: number;
  periodTotal: number;
  last24h: number;
  usersAffected: number;
  logs: AdminMismatchLog[];
}

export interface AdminPushNotification {
  key: AdminPushNotificationKey;
  category: AdminPushNotificationCategory;
  title: string;
  body: string;
  trigger: string;
  clickUrl: string;
  isEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  updatedByDisplayName: string | null;
}

export interface AdminPushNotificationPatch {
  title?: string;
  body?: string;
  trigger?: string;
  clickUrl?: string;
  isEnabled?: boolean;
}

export interface AdminPushMonitoringResponse {
  generatedAt: string;
  overview: {
    totalDeliveries: number;
    queued: number;
    processing: number;
    sent: number;
    partial: number;
    failed: number;
    skipped: number;
    dueQueued: number;
    staleProcessing: number;
    subscriptionCount: number;
    subscriptionSentCount: number;
    subscriptionFailedCount: number;
    clickedDeliveryCount: number;
    clickCount: number;
    failed24h: number;
    partial24h: number;
    sent24h: number;
    skipped24h: number;
    deliveryClickRate: number;
    subscriptionClickRate: number;
    oldestQueuedAt: string | null;
    oldestQueuedAgeSeconds: number;
  };
  alerts: Array<{
    key: string;
    severity: 'warning' | 'danger';
    title: string;
    body: string;
  }>;
  byStatus: Array<{ status: AdminPushDeliveryStatus; count: number }>;
  byEventType: Array<{
    eventType: AdminPushNotificationKey;
    total: number;
    queued: number;
    processing: number;
    sent: number;
    partial: number;
    failed: number;
    skipped: number;
    subscriptionCount: number;
    subscriptionSentCount: number;
    subscriptionFailedCount: number;
    clickedDeliveryCount: number;
    clickCount: number;
    deliveryClickRate: number;
    subscriptionClickRate: number;
    lastCreatedAt: string | null;
    lastUpdatedAt: string | null;
  }>;
  recent: Array<{
    id: string;
    userId: string;
    userDisplayName: string;
    eventType: AdminPushNotificationKey;
    eventKey: string;
    status: AdminPushDeliveryStatus;
    attemptCount: number;
    subscriptionCount: number;
    sentCount: number;
    failedCount: number;
    clickCount: number;
    clickedAt: string | null;
    lastErrorMessage: string | null;
    nextAttemptAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface AdminChannelPost {
  id: string;
  chatId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
  commenters: number;
  reactionsCount: number;
  reactionUsers: number;
  likes: number;
  views: number;
  viewers: number;
  reactions: Array<{ emoji: string; count: number }>;
}

export interface AdminChannelPeriodPoint {
  periodStart: string;
  posts: number;
  comments: number;
  commenters: number;
  reactions: number;
  reactors: number;
  likes: number;
  viewEvents: number;
  views: number;
  viewers: number;
  engagedUsers: number;
  engagementRate: number;
}

export interface AdminChannelResponse {
  channel: { id: string; name: string | null; slug: string | null; createdAt: string } | null;
  period: AdminChannelPeriod;
  summary: {
    totalUsers: number;
    posts: number;
    comments: number;
    reactions: number;
    likes: number;
    viewEvents: number;
    views: number;
    engagedUsers: number;
    engagementRate: number;
  };
  periods: AdminChannelPeriodPoint[];
  posts: AdminChannelPost[];
}

export interface AdminInventoryItemPatch {
  photoUrl?: string;
  title?: string;
  description?: string;
  priceRub?: number;
}

export interface AdminGameSetting {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'select';
  defaultValue: GameSettingValue;
  min?: number;
  max?: number;
  step?: number;
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
  isBlocked?: boolean;
  wallet?: Partial<AdminUser['wallet']>;
}

export function fetchAdminSummary(period: AdminDashboardPeriod): Promise<AdminSummary> {
  const params = new URLSearchParams({ period });
  return apiFetch<AdminSummary>(`/admin/summary?${params.toString()}`);
}

export interface AdminUsersQuery {
  q: string;
  role: 'all' | AdminRole;
  level: AdminLevelFilter;
  sort: AdminSort;
  minGoals: string;
  minAccuracy: string;
}

export function fetchAdminUsers(query: AdminUsersQuery): Promise<AdminUsersResponse> {
  const params = new URLSearchParams({ limit: '20', offset: '0' });
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.role !== 'all') params.set('role', query.role);
  if (query.level !== 'all') params.set('level', query.level);
  if (query.sort !== 'name_asc') params.set('sort', query.sort);
  if (query.minGoals.trim()) params.set('minGoals', query.minGoals.trim());
  if (query.minAccuracy.trim()) params.set('minAccuracy', query.minAccuracy.trim());
  return apiFetch<AdminUsersResponse>(`/admin/users?${params.toString()}`);
}

export interface AdminPaymentsQuery {
  q: string;
  status: 'all' | AdminPaymentStatus;
  sort: AdminPaymentSort;
  minAmount: string;
  maxAmount: string;
}

export function fetchAdminPayments(query: AdminPaymentsQuery): Promise<AdminPaymentsResponse> {
  const params = new URLSearchParams({ limit: '50', offset: '0' });
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.status !== 'all') params.set('status', query.status);
  if (query.sort !== 'created_desc') params.set('sort', query.sort);
  if (query.minAmount.trim()) params.set('minAmount', query.minAmount.trim());
  if (query.maxAmount.trim()) params.set('maxAmount', query.maxAmount.trim());
  return apiFetch<AdminPaymentsResponse>(`/admin/payments?${params.toString()}`);
}

export function fetchAdminFeedback(query: AdminFeedbackQuery): Promise<AdminFeedbackResponse> {
  const params = new URLSearchParams({ limit: '50', offset: '0' });
  if (query.kind !== 'all') params.set('kind', query.kind);
  if (query.status !== 'all') params.set('status', query.status);
  return apiFetch<AdminFeedbackResponse>(`/admin/feedback?${params.toString()}`);
}

export function fetchAdminMismatches(period: AdminMismatchPeriod): Promise<AdminMismatchesResponse> {
  const params = new URLSearchParams({ period, limit: '50' });
  return apiFetch<AdminMismatchesResponse>(`/admin/mismatches?${params.toString()}`);
}

export function fetchAdminNotifications(): Promise<{ notifications: AdminPushNotification[] }> {
  return apiFetch<{ notifications: AdminPushNotification[] }>('/admin/notifications');
}

export function fetchAdminPushMonitoring(): Promise<AdminPushMonitoringResponse> {
  return apiFetch<AdminPushMonitoringResponse>('/admin/push-monitoring');
}

export function patchAdminNotification(
  key: AdminPushNotificationKey,
  body: AdminPushNotificationPatch,
): Promise<{ notification: AdminPushNotification }> {
  return apiFetch<{ notification: AdminPushNotification }>(
    `/admin/notifications/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function fetchAdminChannelNews(period: AdminChannelPeriod): Promise<AdminChannelResponse> {
  const params = new URLSearchParams({ period });
  return apiFetch<AdminChannelResponse>(`/admin/channel/news?${params.toString()}`);
}

export function patchAdminChannelPost(
  postId: string,
  content: string,
): Promise<{ post: { id: string; content: string } }> {
  return apiFetch<{ post: { id: string; content: string } }>(`/admin/channel/posts/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export function deleteAdminChannelPost(postId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/admin/channel/posts/${postId}`, {
    method: 'DELETE',
  });
}

export function patchAdminFeedback(
  feedbackId: string,
  isRead: boolean,
): Promise<{ feedback: AdminFeedback }> {
  return apiFetch<{ feedback: AdminFeedback }>(`/admin/feedback/${feedbackId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
}

export function fetchAdminInventory(): Promise<{ items: AdminInventoryItem[] }> {
  return apiFetch<{ items: AdminInventoryItem[] }>('/admin/inventory');
}

export function createAdminInventoryItem(
  body: Required<AdminInventoryItemPatch>,
): Promise<{ item: AdminInventoryItem }> {
  return apiFetch<{ item: AdminInventoryItem }>('/admin/inventory', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function patchAdminInventoryItem(
  itemId: string,
  body: AdminInventoryItemPatch,
): Promise<{ item: AdminInventoryItem }> {
  return apiFetch<{ item: AdminInventoryItem }>(`/admin/inventory/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAdminInventoryItem(itemId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/admin/inventory/${itemId}`, {
    method: 'DELETE',
  });
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
