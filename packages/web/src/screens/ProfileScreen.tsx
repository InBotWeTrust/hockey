import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, ChevronDown, MessageSquare, Send, Settings, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { createFeedback, type FeedbackKind } from '../api/feedback.js';
import {
  deletePushSubscription,
  fetchPushConfig,
  fetchPushPreferences,
  savePushSubscription,
  sendTestPush,
  updatePushPreferences,
  type PushConfig,
  type PushPreferences,
  type PushSubscriptionPayload,
} from '../api/push.js';
import { useAuthStore } from '../auth/authStore.js';
import { NAV_HEIGHT } from '../components/BottomNav.js';
import type { ProfileAchievement, ProfileData } from './profileTypes.js';
import {
  AchievementDetailsSheet,
  EMPTY_PROFILE_STATS,
  getLevelLabel,
  ProfileAchievementsSection,
  ProfileStatsGrid,
} from './profileSections.js';

function canStartMouseDragScroll(target: EventTarget | null): boolean {
  return (
    !(target instanceof Element) ||
    target.closest('[data-no-drag-scroll], button, a, input, textarea, select') === null
  );
}

type PushStatus =
  | 'idle'
  | 'subscribing'
  | 'subscribed'
  | 'unsubscribing'
  | 'unsupported'
  | 'denied'
  | 'error';
type TestPushStatus = 'idle' | 'sending';
type PushPreferenceKey = keyof PushPreferences;

const PUSH_PREFERENCES_QUERY_KEY = ['push', 'preferences'] as const;
const PUSH_PREFERENCE_ITEMS: Array<{
  key: PushPreferenceKey;
  label: string;
  hint: string;
}> = [
  {
    key: 'chatNewDialogMessage',
    label: 'Первое сообщение в личке',
    hint: 'Только когда новый пользователь начал диалог',
  },
  {
    key: 'dailyGame',
    label: 'Ежедневная игра',
    hint: 'Новый день, перерывы и окончание периода',
  },
  {
    key: 'trainingAvailable',
    label: 'Тренировка доступна',
    hint: 'Когда обновился лимит тренировки',
  },
  {
    key: 'gameNews',
    label: 'Новости игры',
    hint: 'Редкие системные объявления',
  },
];

const FEEDBACK_KIND_OPTIONS: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: 'review', label: 'Отзыв' },
  { kind: 'suggestion', label: 'Пожелание' },
  { kind: 'question', label: 'Вопрос' },
];

function supportsPushNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return buffer;
}

function normalizePushSubscription(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('invalid push subscription');
  }
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('service worker is not ready')), 8000);
    navigator.serviceWorker.ready.then(
      (registration) => {
        window.clearTimeout(timeout);
        resolve(registration);
      },
      (err: unknown) => {
        window.clearTimeout(timeout);
        reject(err);
      },
    );
  });
}

function PushPreferenceToggle({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-no-drag-scroll="true"
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: '100%',
        minHeight: 58,
        padding: '10px 12px',
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 16,
        background: 'rgba(255, 255, 255, 0.34)',
        color: 'var(--ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.62 : 1,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', lineHeight: 1.2 }}>
          {hint}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          padding: 3,
          background: checked ? 'rgba(15, 23, 42, 0.9)' : 'rgba(100, 116, 139, 0.28)',
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.24)',
          }}
        />
      </span>
    </button>
  );
}

function FeedbackModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [kind, setKind] = useState<FeedbackKind>('review');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const feedback = useMutation({
    mutationFn: () =>
      createFeedback({
        kind,
        ...(kind === 'review' ? { rating } : {}),
        message,
      }),
  });
  const messageLength = message.trim().length;
  const canSubmit = messageLength > 0 && messageLength <= 2000 && !feedback.isPending;

  function handleKindChange(nextKind: FeedbackKind): void {
    if (nextKind === kind) return;
    feedback.reset();
    setKind(nextKind);
  }

  function handleClose(event?: MouseEvent): void {
    event?.stopPropagation();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Обратная связь"
      onClick={() => handleClose()}
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
        padding: 'calc(18px + var(--app-safe-top)) 14px calc(18px + var(--app-safe-bottom))',
      }}
    >
      <section
        className="glass"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 24,
          padding: 18,
          color: 'var(--ink)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: '0.11em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
              }}
            >
              Обратная связь
            </div>
            <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>
              {feedback.isSuccess ? 'Спасибо, сообщение сохранено' : 'Выберите тип сообщения'}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            data-no-drag-scroll="true"
            onClick={handleClose}
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        {feedback.isSuccess ? (
          <button
            type="button"
            className="btn btn--cta"
            data-no-drag-scroll="true"
            onClick={handleClose}
            style={{ marginTop: 18, width: '100%', minHeight: 52, letterSpacing: 0 }}
          >
            Понятно
          </button>
        ) : (
          <>
            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              {FEEDBACK_KIND_OPTIONS.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  data-no-drag-scroll="true"
                  className={kind === item.kind ? 'chip chip--active' : 'chip'}
                  onClick={() => handleKindChange(item.kind)}
                  style={{
                    minHeight: 42,
                    borderRadius: 14,
                    justifyContent: 'center',
                    padding: '8px 10px',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {kind === 'review' && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    color: 'var(--muted)',
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  Оценка
                </div>
                <div
                  role="radiogroup"
                  aria-label="Оценка отзыва"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                    gap: 6,
                  }}
                >
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} из 5`}
                      data-no-drag-scroll="true"
                      onClick={() => setRating(value)}
                      className={rating === value ? 'chip chip--active' : 'chip'}
                      style={{
                        minWidth: 0,
                        height: 40,
                        borderRadius: 13,
                        padding: 0,
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label style={{ marginTop: 14, display: 'block' }}>
              <span
                style={{
                  display: 'block',
                  color: 'var(--muted)',
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Сообщение
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 2000))}
                placeholder={
                  kind === 'review'
                    ? 'Что понравилось или мешает?'
                    : kind === 'suggestion'
                      ? 'Что стоит добавить или поменять?'
                      : 'Что хотите уточнить?'
                }
                rows={6}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: 132,
                  border: '1px solid rgba(255,255,255,0.74)',
                  borderRadius: 18,
                  background: 'rgba(255, 255, 255, 0.46)',
                  color: 'var(--ink)',
                  padding: 12,
                  outline: 'none',
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
                }}
              />
            </label>

            <div
              style={{
                marginTop: 6,
                minHeight: 18,
                color: feedback.isError ? 'var(--red-deep)' : 'var(--muted)',
                fontSize: 11,
                fontWeight: 800,
              }}
              role={feedback.isError ? 'alert' : undefined}
            >
              {feedback.isError
                ? 'Не удалось отправить сообщение'
                : `${messageLength}/2000 символов`}
            </div>

            <button
              type="button"
              className="btn btn--cta"
              data-no-drag-scroll="true"
              disabled={!canSubmit}
              onClick={() => feedback.mutate()}
              style={{
                marginTop: 12,
                width: '100%',
                minHeight: 54,
                letterSpacing: 0,
                opacity: canSubmit ? 1 : 0.56,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              <Send size={18} />
              {feedback.isPending ? 'Отправляем...' : 'Отправить'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export function ProfileScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const dragScrollRef = useRef<{ startY: number; scrollTop: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [selectedAchievement, setSelectedAchievement] = useState<ProfileAchievement | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus>('idle');
  const [pushMessage, setPushMessage] = useState('');
  const [testPushStatus, setTestPushStatus] = useState<TestPushStatus>('idle');
  const [testPushMessage, setTestPushMessage] = useState('');
  const [pendingPreference, setPendingPreference] = useState<PushPreferenceKey | null>(null);
  const [pushPreferencesOpen, setPushPreferencesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  const { data: pushConfig, isLoading: isPushConfigLoading } = useQuery<PushConfig>({
    queryKey: ['push', 'config'],
    queryFn: fetchPushConfig,
    enabled: data !== undefined,
  });

  const { data: pushPreferences } = useQuery<PushPreferences>({
    queryKey: PUSH_PREFERENCES_QUERY_KEY,
    queryFn: fetchPushPreferences,
    enabled: data !== undefined,
  });

  useEffect(() => {
    if (data) {
      updateUser({
        grip: data.grip,
        displayName: data.displayName,
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.displaySource !== undefined ? { displaySource: data.displaySource } : {}),
        ...(data.linkedProviders !== undefined ? { linkedProviders: data.linkedProviders } : {}),
      });
    }
  }, [data, updateUser]);

  useEffect(() => {
    if (!data) return;

    if (!supportsPushNotifications()) {
      setPushStatus('unsupported');
      setPushMessage('Недоступно в этом браузере');
      return;
    }

    let disposed = false;
    getReadyServiceWorkerRegistration()
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (disposed) return;
        if (subscription) {
          setPushStatus('subscribed');
          setPushMessage('Уведомления включены');
          return;
        }
        if (Notification.permission === 'denied') {
          setPushStatus('denied');
          setPushMessage('Запрещено в настройках браузера');
        }
      })
      .catch(() => {
        // The PWA service worker can be absent in local dev. The subscribe
        // button will surface the actionable error if the user taps it.
        if (!disposed && Notification.permission === 'denied') {
          setPushStatus('denied');
          setPushMessage('Запрещено в настройках браузера');
        }
      });

    return () => {
      disposed = true;
    };
  }, [data]);

  async function handleSubscribePush(): Promise<void> {
    setTestPushMessage('');

    if (!supportsPushNotifications()) {
      setPushStatus('unsupported');
      setPushMessage('Недоступно в этом браузере');
      return;
    }

    if (!pushConfig || isPushConfigLoading) {
      setPushMessage('Пробуем еще раз через секунду');
      return;
    }

    if (!pushConfig.supported || !pushConfig.publicKey) {
      setPushStatus('error');
      setPushMessage('Пуши не настроены на сервере');
      return;
    }

    const permission =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();

    if (permission !== 'granted') {
      setPushStatus(permission === 'denied' ? 'denied' : 'idle');
      setPushMessage('Разрешение не выдано');
      return;
    }

    setPushStatus('subscribing');
    setPushMessage('');

    try {
      const registration = await getReadyServiceWorkerRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(pushConfig.publicKey),
        }));

      await savePushSubscription(normalizePushSubscription(subscription));
      setPushStatus('subscribed');
      setPushMessage('Уведомления включены');
    } catch {
      setPushStatus('error');
      setPushMessage('Не удалось включить уведомления');
    }
  }

  async function handleUnsubscribePush(): Promise<void> {
    if (!supportsPushNotifications()) {
      setPushStatus('unsupported');
      setPushMessage('Недоступно в этом браузере');
      return;
    }

    setPushStatus('unsubscribing');
    setPushMessage('');

    try {
      const registration = await getReadyServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushStatus('idle');
        setPushMessage('Уведомления отключены');
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await deletePushSubscription(endpoint);
      setPushStatus('idle');
      setPushMessage('Уведомления отключены');
    } catch {
      setPushStatus('error');
      setPushMessage('Не удалось отключить уведомления');
    }
  }

  async function handleTogglePushPreference(key: PushPreferenceKey): Promise<void> {
    if (!pushPreferences || pendingPreference !== null) return;

    const previous = pushPreferences;
    const next = { ...previous, [key]: !previous[key] };
    setPendingPreference(key);
    setPushMessage('');
    queryClient.setQueryData<PushPreferences>(PUSH_PREFERENCES_QUERY_KEY, next);

    try {
      const patch: Partial<PushPreferences> = { [key]: next[key] };
      const updated = await updatePushPreferences(patch);
      queryClient.setQueryData<PushPreferences>(PUSH_PREFERENCES_QUERY_KEY, updated);
    } catch {
      queryClient.setQueryData<PushPreferences>(PUSH_PREFERENCES_QUERY_KEY, previous);
      setPushStatus('error');
      setPushMessage('Не удалось сохранить настройки');
    } finally {
      setPendingPreference(null);
    }
  }

  async function handleSendTestPush(): Promise<void> {
    setTestPushStatus('sending');
    setTestPushMessage('');

    try {
      const result = await sendTestPush();
      if (result.total === 0) {
        setTestPushMessage('Нет активной подписки');
      } else if (result.failed > 0) {
        setTestPushMessage(`Отправлено ${result.sent}, ошибок ${result.failed}`);
      } else {
        setTestPushMessage('Тестовый пуш отправлен');
      }
    } catch {
      setTestPushMessage('Не удалось отправить тест');
    } finally {
      setTestPushStatus('idle');
    }
  }

  if (isLoading) {
    return (
      <main className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Загрузка...</div>
      </main>
    );
  }

  const initial = (data?.displayName ?? '?').charAt(0).toUpperCase();
  const stats = data?.stats ?? EMPTY_PROFILE_STATS;
  const achievements = data?.achievements ?? [];
  const isAdmin = data?.role === 'admin';
  const pushButtonLabel =
    pushStatus === 'subscribed'
      ? 'Уведомления включены'
      : pushStatus === 'unsubscribing'
        ? 'Отключаем...'
        : pushStatus === 'subscribing'
          ? 'Подключаем...'
          : 'Включить уведомления';
  const pushButtonDisabled =
    pushStatus === 'subscribing' ||
    pushStatus === 'unsubscribing' ||
    pushStatus === 'subscribed' ||
    pushStatus === 'unsupported' ||
    pushStatus === 'denied' ||
    isPushConfigLoading;

  function handlePointerDown(event: PointerEvent<HTMLElement>): void {
    if (
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      !canStartMouseDragScroll(event.target)
    ) {
      return;
    }

    dragScrollRef.current = {
      startY: event.clientY,
      scrollTop: event.currentTarget.scrollTop,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>): void {
    const drag = dragScrollRef.current;
    if (drag === null || event.pointerType !== 'mouse') return;

    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > 4) {
      suppressClickRef.current = true;
      event.preventDefault();
    }
    event.currentTarget.scrollTop = drag.scrollTop - deltaY;
  }

  function handlePointerEnd(event: PointerEvent<HTMLElement>): void {
    dragScrollRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  return (
    <main
      className="screen"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        height: '100dvh',
        minHeight: 0,
        paddingBottom: `calc(${NAV_HEIGHT + 16}px + var(--app-safe-bottom))`,
        overflowY: 'auto',
        overscrollBehaviorY: 'contain',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div
        className="glass"
        style={{
          margin: 'calc(16px + var(--app-safe-top)) 14px 14px',
          padding: 20,
          borderRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          position: 'relative',
        }}
      >
        <button
          type="button"
          className="icon-btn"
          data-no-drag-scroll="true"
          aria-label="Настройки"
          onClick={() => navigate('/profile/settings')}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 40,
            height: 40,
            borderRadius: 12,
            color: 'var(--ink)',
            background: 'rgba(255, 255, 255, 0.55)',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            zIndex: 1,
          }}
        >
          <Settings size={18} />
        </button>
        {data?.avatarUrl ? (
          <img
            src={data.avatarUrl}
            alt="avatar"
            style={{
              width: 88,
              height: 88,
              borderRadius: 999,
              objectFit: 'cover',
              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
            }}
          />
        ) : (
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 999,
              background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
              color: '#ffffff',
              fontSize: 32,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', textAlign: 'center' }}>
            {data?.displayName ?? '-'}
          </div>
          {(data?.username || data?.tgId) && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {data.username ? `@${data.username}` : `id ${data.tgId}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <span className="pill pill--dark">
            <small>Уровень</small> {getLevelLabel(data?.competitionLevel)}
          </span>
        </div>
      </div>

      <div className="section-label" style={{ marginBottom: 6 }}>
        Статистика
      </div>
      <ProfileStatsGrid stats={stats} style={{ margin: '0 14px 14px' }} />

      <ProfileAchievementsSection
        achievements={achievements}
        onOpenAchievement={(achievement) => {
          if (!suppressClickRef.current) setSelectedAchievement(achievement);
        }}
      />

      <div className="section-label" style={{ marginBottom: 8 }}>
        Уведомления
      </div>
      <div
        className="glass"
        style={{
          margin: '0 14px 14px',
          padding: 16,
          borderRadius: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'rgba(255, 255, 255, 0.72)',
              color: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '1px solid rgba(255, 255, 255, 0.88)',
              boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Bell size={20} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
              Пуш-уведомления
            </div>
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 3,
                minHeight: 18,
                fontSize: 12,
                fontWeight: 700,
                color:
                  pushStatus === 'error' || pushStatus === 'denied' ? '#b42318' : 'var(--muted)',
              }}
            >
              {pushMessage || 'Отключены'}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--cta"
          data-no-drag-scroll="true"
          disabled={pushButtonDisabled}
          onClick={() => void handleSubscribePush()}
          style={{ width: '100%', minHeight: 52, letterSpacing: 0 }}
        >
          <Bell size={18} />
          {pushButtonLabel}
        </button>

        {pushStatus === 'subscribed' || pushStatus === 'unsubscribing' ? (
          <button
            type="button"
            className="btn btn--ghost"
            data-no-drag-scroll="true"
            disabled={pushStatus === 'unsubscribing'}
            onClick={() => void handleUnsubscribePush()}
            style={{ width: '100%', minHeight: 50, letterSpacing: 0 }}
          >
            <BellOff size={18} />
            {pushStatus === 'unsubscribing' ? 'Отключаем...' : 'Отключить все'}
          </button>
        ) : null}

        {pushPreferences ? (
          <>
            <button
              type="button"
              data-no-drag-scroll="true"
              aria-expanded={pushPreferencesOpen}
              onClick={() => setPushPreferencesOpen((value) => !value)}
              style={{
                width: '100%',
                minHeight: 46,
                padding: '0 12px',
                border: '1px solid rgba(255,255,255,0.7)',
                borderRadius: 16,
                background: 'rgba(255, 255, 255, 0.34)',
                color: 'var(--ink)',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 800,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Настройки уведомлений
              <ChevronDown
                size={18}
                style={{
                  transform: pushPreferencesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}
              />
            </button>
            {pushPreferencesOpen ? (
              <div
                role="group"
                aria-label="Категории уведомлений"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  paddingTop: 2,
                }}
              >
                {PUSH_PREFERENCE_ITEMS.map((item) => (
                  <PushPreferenceToggle
                    key={item.key}
                    label={item.label}
                    hint={item.hint}
                    checked={pushPreferences[item.key]}
                    disabled={pendingPreference !== null}
                    onToggle={() => void handleTogglePushPreference(item.key)}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {isAdmin && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              data-no-drag-scroll="true"
              disabled={testPushStatus === 'sending'}
              onClick={() => void handleSendTestPush()}
              style={{ width: '100%', minHeight: 50, letterSpacing: 0 }}
            >
              <Send size={18} />
              {testPushStatus === 'sending' ? 'Отправляем...' : 'Тестовый пуш'}
            </button>
            {testPushMessage && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textAlign: 'center',
                }}
              >
                {testPushMessage}
              </div>
            )}
          </>
        )}
      </div>
      <div className="section-label" style={{ marginBottom: 8 }}>
        Обратная связь
      </div>
      <div
        className="glass"
        style={{
          margin: '0 14px 14px',
          padding: 16,
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'rgba(255, 255, 255, 0.72)',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid rgba(255, 255, 255, 0.88)',
            boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
          }}
        >
          <MessageSquare size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
            Форма обратной связи
          </div>
          <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
            Отзыв, пожелание или вопрос
          </div>
        </div>
        <button
          type="button"
          className="btn btn--cta"
          data-no-drag-scroll="true"
          aria-label="Написать в обратную связь"
          onClick={() => setFeedbackOpen(true)}
          style={{
            minHeight: 42,
            padding: '0 14px',
            borderRadius: 14,
            fontSize: 12,
            letterSpacing: 0,
            flexShrink: 0,
          }}
        >
          Написать
        </button>
      </div>
      {selectedAchievement !== null && (
        <AchievementDetailsSheet
          achievement={selectedAchievement}
          onClose={() => setSelectedAchievement(null)}
        />
      )}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </main>
  );
}
