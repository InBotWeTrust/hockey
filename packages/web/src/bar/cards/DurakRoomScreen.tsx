import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { UserAvatar } from '../../chat/components/UserAvatar.js';
import { useAuthStore } from '../../auth/authStore.js';
import { searchPlayers, respond, type PickerPlayer } from './onlineApi.js';
import { readRoom, roomCommand, roomInvite, type RoomView, type RoomCommand } from './roomApi.js';
import { DurakTable } from './DurakScreen.js';
import { createGame } from './rules.js';
import { MultiDurakTable } from './MultiDurakTable.js';
import '../bar.css';
import './durak.css';

export function DurakRoomScreen({ previewUserId }: { previewUserId?: string } = {}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const actualUserId = useAuthStore((s) => s.user?.id);
  const userId = previewUserId ?? actualUserId;
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState<PickerPlayer[]>([]);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const current = useRef<RoomView | null>(null);
  const generation = useRef(0);
  const actionVersion = useRef(0);
  const sending = useRef(false);
  const offset = useRef(0);
  const receive = (next: RoomView) => {
    if (next.id !== id) {
      navigate(`/bar/cards/room/${next.id}`, { replace: true });
      return;
    }
    if (current.current && next.revision < current.current.revision) return;
    current.current = next;
    offset.current = next.serverNow - Date.now();
    setView(next);
    setError(null);
  };
  useEffect(() => {
    const ticket = ++generation.current;
    current.current = null;
    setView(null);
    setError(null);
    let reading = false;
    const refresh = async () => {
      if (reading || sending.current || document.hidden) return;
      reading = true;
      const version = actionVersion.current;
      try {
        const next = await readRoom(id!);
        if (ticket === generation.current && version === actionVersion.current) receive(next);
      } catch {
        if (ticket === generation.current) setError('Связь потеряна. Восстанавливаем…');
      } finally {
        reading = false;
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 1500);
    const tick = setInterval(() => setNow(Date.now()), 250);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      generation.current++;
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id]);
  useEffect(() => {
    if (!inviteOpen) return;
    let alive = true;
    setPickerError(null);
    const timer = setTimeout(
      () =>
        void searchPlayers(q.trim())
          .then((rows) => {
            if (alive) setPlayers(rows);
          })
          .catch(() => {
            if (alive) setPickerError('Не удалось загрузить игроков. Попробуй ещё раз.');
          }),
      q ? 300 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [inviteOpen, q]);
  const send = async (command: RoomCommand) => {
    if (sending.current || !current.current) return;
    sending.current = true;
    actionVersion.current++;
    setBusy(true);
    const ticket = generation.current;
    try {
      const next = await roomCommand(id!, current.current.revision, command);
      if (ticket !== generation.current) return;
      if (next.left) {
        navigate('/bar', { replace: true });
        return;
      }
      receive(next);
    } catch (err) {
      if (ticket === generation.current)
        setError(
          err instanceof Error ? err.message : 'Действие не подтверждено. Попробуй ещё раз.',
        );
    } finally {
      sending.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  };
  if (!view)
    return (
      <main className="screen bar-screen">
        <p role="status">{error ?? 'Загружаем стол…'}</p>
        <button className="btn btn--ghost" onClick={() => navigate('/bar', { replace: true })}>
          Вернуться
        </button>
      </main>
    );
  const serverNow = now + offset.current;
  if (
    view.capacity === 2 &&
    !view.game &&
    ['confirming', 'countdown', 'ended'].includes(view.status)
  ) {
    const seconds = Math.max(
      0,
      Math.ceil(((view.countdownAt ?? view.readyUntil ?? serverNow) - serverNow) / 1000),
    );
    const opponent = view.seats.find((s) => s.userId !== userId);
    const self = view.seats.find((s) => s.userId === userId);
    const ready = view.ready.includes(userId ?? '');
    const text =
      view.status === 'ended'
        ? 'Встреча отменена: готовность не подтверждена.'
        : view.status === 'countdown'
          ? 'Игра начинается'
          : ready
            ? 'Ждём готовности соперника'
            : 'Подтвердите готовность';
    const empty = { ...createGame(() => 0.4), hands: [[], []] as [never[], never[]], deck: [] };
    return (
      <DurakTable
        online
        opponent={{
          displayName: opponent?.displayName ?? 'Соперник',
          avatarUrl: opponent?.avatarUrl ?? null,
        }}
        previewPlayer={{
          displayName: self?.displayName ?? 'Игрок',
          ...(self?.avatarUrl ? { avatarUrl: self.avatarUrl } : {}),
        }}
        error={error}
        pregame={{
          text,
          ready,
          opponentReady: !!opponent && view.ready.includes(opponent.userId),
          countdown: view.status === 'countdown',
          cancelled: view.status === 'ended',
          pending: busy,
          onReady: () => void send({ type: 'ready' }),
        }}
        controller={{
          game: empty,
          dispatch: () => {},
          surrender: () => void send({ type: 'leave' }),
          restart: () => navigate('/bar', { replace: true }),
          remainingSeconds: seconds,
          thinking: true,
        }}
      />
    );
  }
  if (
    view.game ||
    (view.seats.length > 2 && ['confirming', 'countdown', 'ended'].includes(view.status))
  )
    return (
      <MultiDurakTable
        view={view}
        {...(userId ? { userId } : {})}
        busy={busy}
        error={error}
        now={serverNow}
        onCommand={(command) => void send(command)}
      />
    );
  const remaining =
    view.searchUntil === null ? 0 : Math.max(0, Math.ceil((view.searchUntil - serverNow) / 1000));
  const countdown =
    view.countdownAt === null ? 0 : Math.max(0, Math.ceil((view.countdownAt - serverNow) / 1000));
  const owner = view.owner === userId;
  const awaitingInvitation = view.status === 'waiting' && view.pending.length > 0;
  const cancelInvitation = (invitationId: string) => {
    if (sending.current) return;
    sending.current = true;
    actionVersion.current++;
    setBusy(true);
    const ticket = generation.current;
    void respond(invitationId, 'cancel')
      .then(async () => {
        const next = await readRoom(view.id);
        if (ticket === generation.current) receive(next);
      })
      .catch((err) => {
        if (ticket === generation.current)
          setError(err instanceof Error ? err.message : 'Не удалось отменить приглашение.');
      })
      .finally(() => {
        sending.current = false;
        if (ticket === generation.current) setBusy(false);
      });
  };
  return (
    <main className="screen bar-screen online-durak-lobby durak-room-lobby">
      <header className="bar-header">
        <button
          className="icon-btn icon-btn--page-back"
          aria-label="Назад"
          onClick={() => navigate('/bar', {replace:true})}
        >
          <ChevronLeft size={22} />
        </button>
        <h1>Карточный стол</h1>
      </header>
      <section className="bar-content">
        <div className="section-label duel-section-title">
          Игроки: {view.seats.length} из {view.capacity}
        </div>
        {view.status === 'waiting' && (view.formats?.length ?? 0) > 1 && (
          <p className="duel-empty-current">Поиск: {view.formats!.join(', ')} игроков</p>
        )}
        <div className="durak-room-seats">
          {Array.from({ length: view.capacity }, (_, i) => {
            const seat = view.seats[i];
            const invitation = !seat ? view.invitations?.[i - view.seats.length] : undefined;
            return (
              <div className="glass online-durak-player" key={seat?.userId ?? invitation?.userId ?? i}>
                <UserAvatar name={seat?.displayName ?? invitation?.displayName ?? '?'} avatarUrl={seat?.avatarUrl ?? invitation?.avatarUrl} size={44} />
                <div className="durak-room-player__identity">
                  <strong>{seat?.displayName ?? invitation?.displayName ?? 'Свободное место'}</strong>
                  <div className="duel-card-meta">
                    {seat
                      ? view.ready.includes(seat.userId)
                        ? 'Готов'
                        : seat.userId === view.owner
                          ? view.status === 'confirming'
                            ? 'Создатель · ожидаем готовности'
                            : 'Создатель стола'
                          : view.status === 'confirming'
                            ? 'Ожидаем готовности'
                            : 'Участник'
                      : view.pending.length > i - view.seats.length
                        ? 'Ждём ответ на приглашение'
                        : 'Ожидаем игрока'}
                  </div>
                </div>
                {invitation && owner && <button
                  className="icon-btn durak-room-invite-cancel"
                  aria-label={`Отменить приглашение: ${invitation.displayName}`}
                  disabled={busy}
                  onClick={() => cancelInvitation(invitation.id)}
                ><X size={20}/></button>}
              </div>
            );
          })}
        </div>
        <div className="online-durak-search">
          {!awaitingInvitation && <p role="status" className="duel-empty-current">
            {view.status === 'confirming'
              ? `Подтвердите готовность — ${Math.max(0, Math.ceil(((view.readyUntil ?? serverNow) - serverNow) / 1000))} сек. (${view.ready.length}/${view.seats.length})`
              : view.status === 'ended' && !view.game
                ? 'Встреча отменена: готовность не подтверждена.'
                : view.status === 'countdown'
                  ? `Начинаем через ${countdown}`
                  : view.proposed
                    ? `Готовы: ${view.ready.length} из ${view.seats.length}`
                    : remaining
                      ? `Ищем игроков… ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
                      : view.searchUntil === null
                        ? 'Пригласи игрока или начни поиск.'
                        : 'Поиск завершён. Можно продолжить поиск или начать текущим составом.'}
          </p>}
          {error && (
            <p role="alert" className="bar-connection">
              {error}
            </p>
          )}
          {view.status === 'confirming' && (
            <button
              className="btn btn--cta"
              disabled={busy || view.ready.includes(userId ?? '')}
              onClick={() => void send({ type: 'ready' })}
            >
              {view.ready.includes(userId ?? '') ? 'Вы готовы' : 'Готов'}
            </button>
          )}
          {view.status === 'waiting' && (
            <>
              {owner && !view.proposed && view.seats.length + view.pending.length < view.capacity && (
                <button
                  className="btn btn--ghost"
                  disabled={busy || view.seats.length + view.pending.length >= view.capacity}
                  onClick={() => setInviteOpen(true)}
                >
                  Пригласить игрока
                </button>
              )}
              {owner && remaining > 0 && !view.proposed && !awaitingInvitation && (
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => void send({ type: 'pause' })}
                >
                  Остановить поиск
                </button>
              )}
              {owner && !remaining && !awaitingInvitation && (
                <button
                  className="btn btn--cta"
                  disabled={busy}
                  onClick={() => void send({ type: 'renew' })}
                >
                  {view.searchUntil === null ? 'Начать поиск' : 'Продолжить поиск'}
                </button>
              )}
              {owner && !remaining && !view.proposed && !awaitingInvitation && view.seats.length >= 2 && (
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => void send({ type: 'propose' })}
                >
                  Начать текущим составом
                </button>
              )}
              {view.proposed && (
                <button
                  className="btn btn--cta"
                  disabled={busy || view.ready.includes(userId ?? '')}
                  onClick={() => void send({ type: 'ready' })}
                >
                  Готов
                </button>
              )}
            </>
          )}
          <button
            className="btn btn--ghost profile-logout-btn--danger"
            disabled={busy}
            onClick={() => void send({ type: 'leave' })}
          >
            Покинуть стол
          </button>
        </div>
      </section>
      {inviteOpen && (
        <AccessibleModal
          title="Пригласить игрока"
          onRequestClose={() => setInviteOpen(false)}
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" onClick={() => setInviteOpen(false)}>
              <X size={15} />
            </button>
          }
        >
          <div className="glass-dock-field duel-opponent-search">
            <input
              className="duel-opponent-search__input"
              type="search"
              aria-label="Имя игрока"
              placeholder="Имя или фамилия"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {pickerError && (
            <p role="alert" className="modal-copy">
              {pickerError}
            </p>
          )}
          <div className="durak-room-picker">
            {players
              .filter(
                (p) =>
                  !view.seats.some((s) => s.userId === p.userId) &&
                  !view.pending.includes(p.userId),
              )
              .map((p) => (
                <button
                  className="glass online-durak-player"
                  key={p.userId}
                  disabled={busy}
                  onClick={() => {
                    if (sending.current) return;
                    sending.current = true;
                    actionVersion.current++;
                    setBusy(true);
                    const ticket = generation.current;
                    void roomInvite(view.id, p.userId)
                      .then(async () => {
                        const next = await readRoom(view.id);
                        if (ticket === generation.current) {
                          receive(next);
                          setInviteOpen(false);
                        }
                      })
                      .catch((err) => {
                        if (ticket === generation.current)
                          setPickerError(
                            err instanceof Error ? err.message : 'Не удалось пригласить игрока.',
                          );
                      })
                      .finally(() => {
                        sending.current = false;
                        if (ticket === generation.current) setBusy(false);
                      });
                  }}
                >
                  <UserAvatar name={p.displayName} avatarUrl={p.avatarUrl} size={36} />
                  <strong>{p.displayName}</strong>
                </button>
              ))}
          </div>
        </AccessibleModal>
      )}
    </main>
  );
}
