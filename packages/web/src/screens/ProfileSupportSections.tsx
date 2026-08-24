import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronDown, MessageSquare, X } from 'lucide-react';
import { createFeedback, type FeedbackKind } from '../api/feedback.js';
import {
  deletePushSubscription,
  fetchPushConfig,
  fetchPushPreferences,
  savePushSubscription,
  updatePushPreferences,
  type PushConfig,
  type PushPreferences,
  type PushSubscriptionPayload,
} from '../api/push.js';
import { getTelegramMiniApp } from '../auth/telegramMiniApp.js';
import { AccessibleModal } from '../components/AccessibleModal.js';

type PushStatus =
  | 'idle'
  | 'subscribing'
  | 'subscribed'
  | 'unsubscribing'
  | 'unsupported'
  | 'denied'
  | 'error';
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
    key: 'duelEvents',
    label: 'Дуэли',
    hint: 'Вызовы и результаты любительских матчей',
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

function SettingsSectionIcon({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        background: 'rgba(15, 23, 42, 0.08)',
        color: 'rgba(15, 23, 42, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35)',
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
}

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

  function handleClose(): void {
    onClose();
  }

  return (
    <AccessibleModal
      title="Обратная связь"
      copy={feedback.isSuccess ? 'Спасибо, сообщение сохранено' : 'Выберите тип сообщения'}
      onRequestClose={handleClose}
      closeBlocked={feedback.isPending}
      backdropStyle={{ zIndex: 1000 }}
      cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}
      headerAction={
        <button
          type="button"
          className="icon-btn"
          data-no-drag-scroll="true"
          disabled={feedback.isPending}
          onClick={handleClose}
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {feedback.isSuccess ? (
          <button
            type="button"
            className="btn btn--cta"
            data-no-drag-scroll="true"
            onClick={handleClose}
            style={{ width: '100%', minHeight: 52, letterSpacing: 0 }}
          >
            Понятно
          </button>
        ) : (
          <>
            <div
              style={{
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
              <div>
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

            <label style={{ display: 'block' }}>
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
                width: '100%',
                minHeight: 54,
                letterSpacing: 0,
                opacity: canSubmit ? 1 : 0.56,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {feedback.isPending ? 'Отправляем...' : 'Отправить'}
            </button>
          </>
        )}
      </div>
    </AccessibleModal>
  );
}

export function ProfileSupportSections({ profileReady }: { profileReady: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const isTelegramMiniApp = getTelegramMiniApp() !== null;
  const [pushStatus, setPushStatus] = useState<PushStatus>('idle');
  const [pushMessage, setPushMessage] = useState('');
  const [pendingPreference, setPendingPreference] = useState<PushPreferenceKey | null>(null);
  const [pushPreferencesOpen, setPushPreferencesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const { data: pushConfig, isLoading: isPushConfigLoading } = useQuery<PushConfig>({
    queryKey: ['push', 'config'],
    queryFn: fetchPushConfig,
    enabled: profileReady && !isTelegramMiniApp,
  });

  const { data: pushPreferences } = useQuery<PushPreferences>({
    queryKey: PUSH_PREFERENCES_QUERY_KEY,
    queryFn: fetchPushPreferences,
    enabled: profileReady && !isTelegramMiniApp,
  });

  useEffect(() => {
    if (isTelegramMiniApp || !profileReady) return;

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
        if (!disposed && Notification.permission === 'denied') {
          setPushStatus('denied');
          setPushMessage('Запрещено в настройках браузера');
        }
      });

    return () => {
      disposed = true;
    };
  }, [profileReady, isTelegramMiniApp]);

  async function handleSubscribePush(): Promise<void> {
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
        setPushMessage('Уведомления выключены');
        return;
      }

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await deletePushSubscription(endpoint);
      setPushStatus('idle');
      setPushMessage('Уведомления выключены');
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

  const isPushSubscribed = pushStatus === 'subscribed' || pushStatus === 'unsubscribing';
  const pushButtonLabel =
    pushStatus === 'unsubscribing'
      ? 'Выключаем...'
      : pushStatus === 'subscribing'
        ? 'Включаем...'
        : isPushSubscribed
          ? 'Выключить уведомления'
          : 'Включить уведомления';
  const pushStatusMessage =
    pushMessage || (pushStatus === 'subscribed' ? 'Уведомления включены' : 'Уведомления выключены');
  const pushButtonDisabled =
    pushStatus === 'subscribing' ||
    pushStatus === 'unsubscribing' ||
    (!isPushSubscribed &&
      (pushStatus === 'unsupported' || pushStatus === 'denied' || isPushConfigLoading));

  return (
    <>
      {!isTelegramMiniApp && (
        <>
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
              <SettingsSectionIcon>
                <Bell size={20} />
              </SettingsSectionIcon>
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
                      pushStatus === 'error' || pushStatus === 'denied'
                        ? '#b42318'
                        : 'var(--muted)',
                  }}
                >
                  {pushStatusMessage}
                </div>
              </div>
              <button
                type="button"
                className="btn btn--cta"
                data-no-drag-scroll="true"
                aria-label={pushButtonLabel}
                disabled={pushButtonDisabled}
                onClick={() =>
                  void (isPushSubscribed ? handleUnsubscribePush() : handleSubscribePush())
                }
                style={{
                  minHeight: 42,
                  padding: '0 14px',
                  borderRadius: 14,
                  fontSize: 12,
                  letterSpacing: 0,
                  flexShrink: 0,
                }}
              >
                {isPushSubscribed ? 'Выключить' : 'Включить'}
              </button>
            </div>

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
          </div>
        </>
      )}

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
        <SettingsSectionIcon>
          <MessageSquare size={20} />
        </SettingsSectionIcon>
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

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
