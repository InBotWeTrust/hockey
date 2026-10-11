import { apiFetch } from '../api/apiFetch.js';
import { BarMemoryControls } from './BarMemoryControls.js';
import { useEffect, useRef, useState } from 'react';
import { Expand, Minimize2, X, NotebookText, MessageCircle, HandFist } from 'lucide-react';
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
interface LocalMessage { localId: string; message: ConversationMessage; failed: boolean }
const thinkingPhrases = ['думает…', 'подбирает слова…', 'готовит ответ…'];
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
  const [showMemory,setShowMemory]=useState(false);
  const [confirmFight,setConfirmFight]=useState(false);
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const inFlight = useRef(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const waiting = sending || !!data?.pending;
  useEffect(() => {
    setThinkingIndex(0);
    if (!waiting) return;
    const timer = setInterval(() => setThinkingIndex(index => (index + 1) % thinkingPhrases.length), 5000);
    return () => clearInterval(timer);
  }, [waiting]);
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
        if(snapshot.turns.some(turn=>turn.fightId))window.dispatchEvent(new Event('bar-access-changed'));
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
  }, [data, sending, localMessages]);
  const send = async (content: string, retryMessage?: LocalMessage) => {
    if (!data || loading || data.pending || inFlight.current || !content) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    const previous = retryMessage ?? localMessages.find(item => item.failed && item.message.content === content);
    const message = previous?.message ?? { id: crypto.randomUUID(), revision: data.revision, content };
    const localId = previous?.localId ?? message.id;
    setLocalMessages(items => [...items.filter(item => item.localId !== localId), {localId, message, failed: false}]);
    try {
      const snapshot = await sendConversation(character, message);
      update.current(snapshot);
      if (alive.current) {
        setData(snapshot);
        if(snapshot.turns.some(turn=>turn.fightId))window.dispatchEvent(new Event('bar-access-changed'));
      }
      if (alive.current) setLocalMessages(items => items.filter(item => item.localId !== localId && !snapshot.turns.some(turn => turn.id === item.message.id)));
    } catch (cause) {
      if (!alive.current) return;
      setLocalMessages(items => items.map(item => item.localId === localId ? {...item, failed: true} : item));
      if (cause instanceof ApiError && cause.status === 409) {
        setError('Разговор изменился в другом окне. Обнови его перед отправкой.');
        try {
          const snapshot = await fetchConversation(character);
          if (!alive.current) return;
          setData(snapshot);
        if(snapshot.turns.some(turn=>turn.fightId))window.dispatchEvent(new Event('bar-access-changed'));
          update.current(snapshot);
          setLocalMessages(items => items.map(item => item.localId === localId ? {...item, message: {...message, id: crypto.randomUUID(), revision: snapshot.revision}} : item));
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
              : 'Ответ не пришёл. Можно повторить отправку сообщения.',
        );
      // The visible local bubble owns retry; the composer can clear immediately.
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
      backdropStyle={{ background: 'var(--liquid-inset-bg)', backdropFilter: 'none', height: 'var(--app-viewport-height, 100dvh)', bottom: 'auto' }}
      dragListener={false}
      cardClassName={`sheet-card game-scoreboard game-scoreboard--stable-surface bar-conversation${!data?.turns.length ? ' bar-conversation--empty' : ''}${expanded ? ' bar-conversation--expanded' : ''}`}
      headerAction={
        <div className="bar-conversation__controls">
          {character==='oleg'&&<button className="icon-btn" aria-label="Подраться с Олегом" disabled={waiting} onClick={()=>setConfirmFight(true)}><HandFist size={18}/></button>}
          <button className="icon-btn" aria-label={showMemory ? 'К разговору' : 'Память'} title={showMemory ? 'К разговору' : 'Память'} disabled={sending || !!data?.pending} onClick={()=>{setShowMemory(value=>!value);setExpanded(true);}}>{showMemory ? <MessageCircle size={18}/> : <NotebookText size={18}/>}</button>
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
        {confirmFight&&<div className="bar-conversation__fight-confirm"><p>Ты чё, подраться захотел? Если проиграешь, вышвырну из бара и до 00:00 не пущу.</p><div className="modal-actions"><button className="btn btn--ghost" disabled={sending} onClick={()=>setConfirmFight(false)}>Отказаться</button><button className="btn btn--cta" disabled={sending} onClick={()=>{setSending(true);void apiFetch('/bar/fights/oleg',{method:'POST'}).then(()=>window.dispatchEvent(new Event('bar-access-changed'))).catch(()=>setError('Не удалось начать драку. Попробуй ещё раз.')).finally(()=>{setSending(false);setConfirmFight(false);});}}>Начать драку</button></div></div>}
        {showMemory ? <BarMemoryControls key={character} character={character} name={name} onChanged={async()=>{
          setLocalMessages([]);
          const next=await fetchConversation(character);setData(next);update.current(next);
        }}/> : <>
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
              <p aria-label={`Сообщение ${name}`} className="glass bar-conversation__bubble">{data.greeting}</p>
              {data.turns.map((turn) => (
                <div key={turn.id}>
                  {turn.user && <p aria-label="Твоё сообщение" className="glass-dark chat-bubble--own bar-conversation__bubble bar-conversation__bubble--user">
                    {turn.user}
                  </p>}
                  <div className={turn.speaker==='oleg'&&turn.intervention?'bar-conversation__intervention':undefined}>
                    {turn.speaker==='oleg'&&turn.intervention&&<div className="bar-conversation__speaker"><img src="/bar/cards/oleg-avatar-v2.webp" alt="Олег"/><strong>Олег</strong></div>}
                    <p aria-label={`Сообщение ${turn.speaker==='oleg'?'Олег':name}`} className="glass bar-conversation__bubble">{turn.assistant}</p>
                  </div>
                </div>
              ))}
            </>
          )}
          {localMessages.filter(item => !data?.turns.some(turn => turn.id === item.message.id)).map(item => (
            <div key={item.localId} className="bar-conversation__local-message">
              <p aria-label="Твоё сообщение" className="glass-dark chat-bubble--own bar-conversation__bubble bar-conversation__bubble--user">{item.message.content}</p>
              {item.failed && <button className="bar-conversation__retry bar-conversation__message-retry" disabled={waiting || loading || !data} onClick={() => void send(item.message.content, item)}>Повторить отправку</button>}
            </div>
          ))}
          {waiting && <p className="bar-conversation__thinking" role="status">{name} {thinkingPhrases[thinkingIndex]}</p>}
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
            onSend={(content) => { void send(content); }}
            placeholder="Сообщение..."
            disabled={!data || loading || sending || !!data.pending}
          />
        </div>
        </>}
      </div>
    </AccessibleModal>
  );
}
