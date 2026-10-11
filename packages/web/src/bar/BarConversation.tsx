import { useEffect, useRef, useState } from 'react';
import { Expand, Minimize2, X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { ApiError } from '../api/apiFetch.js';
import {
  fetchConversation,
  sendConversation,
  type BarCharacter,
  type ConversationMessage,
  type ConversationSnapshot,
} from './conversationApi.js';
import { ChatInput } from '../chat/components/ChatInput.js';
import './bar-conversation.css';
export function BarConversation({
  character,
  name,
  role,
  avatar,
  onClose,
  onUpdate,
}: {
  character: BarCharacter;
  name: string;
  role?: string;
  avatar?: string | null;
  onClose: () => void;
  onUpdate: (data: ConversationSnapshot) => void;
}) {
  const [data, setData] = useState<ConversationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [readError, setReadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<ConversationMessage | null>(null);
  const alive = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  const update = useRef(onUpdate);
  update.current = onUpdate;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError('');
    setReadError(false);
    const read = async () => {
      try {
        const snapshot = await fetchConversation(character);
        if (cancelled) return;
        setData(snapshot);
        setLoading(false);
        update.current(snapshot);
        if (snapshot.pending)
          timer = setTimeout(() => {
            void read();
          }, 2000);
      } catch {
        if (!cancelled) {
          setError('Не удалось загрузить разговор.');
          setReadError(true);
          setLoading(false);
        }
      }
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [character, retry]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [data, sending]);
  const send = async (content: string) => {
    if (!data || loading || data.pending || inFlight.current || !content) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    if (!request.current || request.current.content !== content)
      request.current = { id: crypto.randomUUID(), revision: data.revision, content };
    try {
      const snapshot = await sendConversation(character, request.current);
      update.current(snapshot);
      if (alive.current) {
        setData(snapshot);
      }
      request.current = null;
    } catch (cause) {
      if (!alive.current) throw cause;
      if (cause instanceof ApiError && cause.status === 409) {
        request.current = null;
        setError('Разговор изменился в другом окне. Обнови его перед отправкой.');
        try {
          const snapshot = await fetchConversation(character);
          setData(snapshot);
          update.current(snapshot);
          if (snapshot.pending) setRetry((n) => n + 1);
        } catch {
          setData(null);
        }
      } else
        setError(
          cause instanceof ApiError && cause.code === 'conversation_preview'
            ? 'В локальном превью OpenAI ещё не подключён.'
            : cause instanceof ApiError && cause.code === 'conversation_limit'
              ? 'Сегодня много поговорили. Продолжим завтра.'
              : 'Ответ не пришёл. Текст сохранён, попробуй отправить ещё раз.',
        );
      throw cause;
    } finally {
      inFlight.current = false;
      if (alive.current) setSending(false);
    }
  };
  return (
    <AccessibleModal
      title={
        <span className="bar-conversation__identity">
          <span className="bar-conversation__avatar">
            {avatar && !avatarFailed ? (
              <img src={avatar} alt="" onError={() => setAvatarFailed(true)} />
            ) : (
              name.slice(0, 1)
            )}
          </span>
          <span>
            {name}
            {role && <small>{role}</small>}
          </span>
        </span>
      }
      ariaLabel={`Разговор: ${name}`}
      presentation="sheet"
      onClose={onClose}
      backdropStyle={{ background: 'var(--liquid-inset-bg)', backdropFilter: 'none' }}
      dragListener={false}
      cardClassName={`sheet-card game-scoreboard game-scoreboard--stable-surface bar-conversation${!data?.turns.length ? ' bar-conversation--empty' : ''}${expanded ? ' bar-conversation--expanded' : ''}`}
      headerAction={
        <div className="bar-conversation__controls">
          <button
            className="icon-btn"
            aria-label={expanded ? 'Свернуть разговор' : 'Развернуть разговор'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
          </button>
          <button className="icon-btn" aria-label="Закрыть разговор" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      }
    >
      <div className="bar-conversation__body">
        <div
          ref={log}
          className="bar-conversation__log"
          role="log"
          aria-label="История разговора"
          aria-live="polite"
        >
          {loading && <p role="status">Загружаем разговор…</p>}
          {data && (
            <>
              <p className="glass bar-conversation__bubble">{data.greeting}</p>
              {data.turns.map((turn) => (
                <div key={turn.id}>
                  <p className="glass-dark chat-bubble--own bar-conversation__bubble bar-conversation__bubble--user">
                    <span className="sr-only">Ты: </span>
                    {turn.user}
                  </p>
                  <p className="glass bar-conversation__bubble">
                    <span className="sr-only">{name}: </span>
                    {turn.assistant}
                  </p>
                </div>
              ))}
            </>
          )}
          {(sending || data?.pending) && <p role="status">{name} отвечает…</p>}
        </div>
        {error && (
          <div className="bar-conversation__error" role="alert">
            <span>{error}</span>
            {(!data || readError) && (
              <button className="bar-conversation__retry" onClick={() => setRetry((v) => v + 1)}>
                Повторить загрузку
              </button>
            )}
          </div>
        )}
        <div className="bar-chat-input bar-conversation__composer">
          <ChatInput
            replyTo={null}
            onClearReply={() => {}}
            onSend={(content) => send(content)}
            placeholder="Сообщение..."
            disabled={!data || loading || sending || !!data.pending}
          />
        </div>
      </div>
    </AccessibleModal>
  );
}
