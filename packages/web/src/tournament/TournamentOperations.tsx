import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Award,
  Archive,
  ArrowLeft,
  Ban,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Trash2,
  Trophy,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { GlassSelect } from '../components/GlassSelect.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import {
  archiveAdminTournament,
  approveAdminTournamentParticipant,
  cancelAdminTournament,
  deleteAdminTournamentDraft,
  dispatchAdminTournamentCommunication,
  disqualifyAdminTournamentParticipant,
  duplicateAdminTournament,
  fetchAdminTournamentBracket,
  fetchAdminTournamentDispatches,
  fetchAdminTournamentParticipants,
  fetchAdminTournamentSchedule,
  fetchAdminTournamentStandings,
  fetchAdminTournamentUsers,
  generateAdminTournamentSchedule,
  grantAdminTournamentRewards,
  inviteAdminTournamentParticipant,
  pauseAdminTournament,
  previewAdminTournamentAudience,
  publishAdminTournament,
  publishAdminTournamentSchedule,
  resolveAdminTournamentNoShow,
  resumeAdminTournament,
  rescheduleAdminTournamentFixture,
  startAdminTournamentPlayoffs,
  type AdminTournament,
  type AdminTournamentFixture,
} from './adminApi.js';
import { participantStateLabel, paymentStateLabel, tournamentStatusLabel } from './labels.js';

type OperationsTab =
  | 'participants'
  | 'schedule'
  | 'standings'
  | 'bracket'
  | 'rewards'
  | 'dispatches';

const tabs: Array<{ key: OperationsTab; label: string }> = [
  { key: 'participants', label: 'Заявки и оплаты' },
  { key: 'schedule', label: 'Календарь' },
  { key: 'standings', label: 'Таблица' },
  { key: 'bracket', label: 'Сетка' },
  { key: 'rewards', label: 'Награды' },
  { key: 'dispatches', label: 'Рассылки' },
];

function readableDate(value: string | null): string {
  if (value === null) return 'время не задано';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU') : 'время не задано';
}

function rowLabel(row: Record<string, unknown>, index: number): string {
  return String(row.display_name ?? row.higher_name ?? `Участник ${index + 1}`);
}

function fixtureStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    conditional: 'Условная игра',
    scheduled: 'Запланирована',
    open: 'Окно открыто',
    active: 'Идёт игра',
    completed: 'Завершена',
    settled: 'Завершена',
    cancelled: 'Отменена',
    forfeit: 'Технический результат',
    blocked: 'Ожидает решения',
    paused: 'Приостановлена',
  };
  return labels[status] ?? 'Статус уточняется';
}

function dispatchKindLabel(kind: unknown): string {
  const labels: Record<string, string> = {
    push: 'Push',
    direct_message: 'Личные сообщения',
    official_news: 'Официальные новости',
  };
  return labels[String(kind)] ?? 'Рассылка';
}

function dispatchStatusLabel(status: unknown): string {
  const labels: Record<string, string> = {
    pending: 'Готовится',
    processing: 'Отправляется',
    sent: 'Отправлена',
    partial: 'Отправлена частично',
    failed: 'Ошибка отправки',
  };
  return labels[String(status)] ?? 'Статус уточняется';
}

function participantPaymentLabel(state: string, coins: number): string {
  if (coins === 0 || state === 'not_required') return 'Без взноса';
  return `Взнос: ${coins} монет · ${paymentStateLabel(state, coins)}`;
}

export function TournamentOperations({
  tournament,
  onBack,
  onEdit,
  onRemoved,
}: {
  tournament: AdminTournament;
  onBack: () => void;
  onEdit: () => void;
  onRemoved: () => void;
}): JSX.Element {
  const client = useQueryClient();
  const [tab, setTab] = useState<OperationsTab>('participants');
  const [status, setStatus] = useState(tournament.status);
  const [reason, setReason] = useState('Решение администратора');
  const [selectedFixture, setSelectedFixture] = useState<AdminTournamentFixture | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [absent, setAbsent] = useState<'home' | 'away' | 'both'>('home');
  const [audience, setAudience] = useState<'approved' | 'all_participants'>('approved');
  const [dispatchKind, setDispatchKind] = useState<'push' | 'direct_message' | 'official_news'>(
    'push',
  );
  const [dispatchBody, setDispatchBody] = useState('');
  const [inviteSearch, setInviteSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const participantsKey = ['admin', 'tournaments', tournament.id, 'participants'] as const;
  const scheduleKey = ['admin', 'tournaments', tournament.id, 'schedule'] as const;
  const standingsKey = ['admin', 'tournaments', tournament.id, 'standings'] as const;
  const bracketKey = ['admin', 'tournaments', tournament.id, 'bracket'] as const;
  const dispatchesKey = ['admin', 'tournaments', tournament.id, 'dispatches'] as const;

  const participants = useQuery({
    queryKey: participantsKey,
    queryFn: () => fetchAdminTournamentParticipants(tournament.id),
    enabled: tab === 'participants',
  });
  const schedule = useQuery({
    queryKey: scheduleKey,
    queryFn: () => fetchAdminTournamentSchedule(tournament.id),
    enabled: tab === 'schedule',
  });
  const standings = useQuery({
    queryKey: standingsKey,
    queryFn: () => fetchAdminTournamentStandings(tournament.id),
    enabled: tab === 'standings',
  });
  const bracket = useQuery({
    queryKey: bracketKey,
    queryFn: () => fetchAdminTournamentBracket(tournament.id),
    enabled: tab === 'bracket',
  });
  const audiencePreview = useQuery({
    queryKey: ['admin', 'tournaments', tournament.id, 'audience', audience],
    queryFn: () => previewAdminTournamentAudience(tournament.id, audience),
    enabled: tab === 'dispatches',
  });
  const dispatches = useQuery({
    queryKey: dispatchesKey,
    queryFn: () => fetchAdminTournamentDispatches(tournament.id),
    enabled: tab === 'dispatches',
  });
  const invitedUsers = useQuery({
    queryKey: ['admin', 'tournament-invite-search', inviteSearch],
    queryFn: () => fetchAdminTournamentUsers(inviteSearch),
    enabled:
      tab === 'participants' &&
      ['draft', 'registration', 'registration_blocked'].includes(status) &&
      inviteSearch.trim().length >= 2,
  });

  const refreshOperations = () => {
    void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    void client.invalidateQueries({ queryKey: ['admin', 'tournaments', tournament.id] });
  };
  const lifecycle = useMutation({
    mutationFn: (action: 'publish' | 'generate' | 'publish_schedule' | 'playoffs') => {
      if (action === 'publish') return publishAdminTournament(tournament.id, tournament.revision);
      if (action === 'generate')
        return generateAdminTournamentSchedule(tournament.id, tournament.revision);
      if (action === 'publish_schedule') return publishAdminTournamentSchedule(tournament.id);
      return startAdminTournamentPlayoffs(tournament.id);
    },
    onSuccess: (result) => {
      if (
        typeof result === 'object' &&
        result !== null &&
        typeof (result as { status?: unknown }).status === 'string'
      ) {
        setStatus((result as { status: string }).status);
      }
      refreshOperations();
    },
  });
  const approve = useMutation({
    mutationFn: (participantId: string) =>
      approveAdminTournamentParticipant(tournament.id, participantId),
    onSuccess: () => client.invalidateQueries({ queryKey: participantsKey }),
  });
  const disqualify = useMutation({
    mutationFn: (participantId: string) =>
      disqualifyAdminTournamentParticipant(tournament.id, participantId, reason),
    onSuccess: () => client.invalidateQueries({ queryKey: participantsKey }),
  });
  const reward = useMutation({
    mutationFn: (stage: 'regular' | 'playoff') => grantAdminTournamentRewards(tournament.id, stage),
    onSuccess: refreshOperations,
  });
  const reschedule = useMutation({
    mutationFn: () =>
      rescheduleAdminTournamentFixture(tournament.id, selectedFixture!.id, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason,
      }),
    onSuccess: () => {
      setSelectedFixture(null);
      void client.invalidateQueries({ queryKey: scheduleKey });
    },
  });
  const noShow = useMutation({
    mutationFn: () =>
      resolveAdminTournamentNoShow(tournament.id, selectedFixture!.id, { absent, reason }),
    onSuccess: () => {
      setSelectedFixture(null);
      void client.invalidateQueries({ queryKey: scheduleKey });
    },
  });
  const dispatch = useMutation({
    mutationFn: () =>
      dispatchAdminTournamentCommunication(tournament.id, {
        idempotencyKey: `${tournament.id}:${Date.now()}`,
        kind: dispatchKind,
        audience,
        title: `Турнир: ${tournament.title}`,
        body: dispatchBody,
      }),
    onSuccess: () => {
      setDispatchBody('');
      void client.invalidateQueries({ queryKey: dispatchesKey });
    },
  });
  const duplicate = useMutation({
    mutationFn: () =>
      duplicateAdminTournament(tournament.id, {
        title: `Копия: ${tournament.title}`,
      }),
    onSuccess: refreshOperations,
  });
  const removeDraft = useMutation({
    mutationFn: () => deleteAdminTournamentDraft(tournament.id),
    onSuccess: () => {
      refreshOperations();
      onRemoved();
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelAdminTournament(tournament.id, tournament.revision),
    onSuccess: (result) => {
      if (typeof result === 'object' && result !== null && 'status' in result) {
        setStatus(String(result.status));
      }
      refreshOperations();
    },
  });
  const archive = useMutation({
    mutationFn: () => archiveAdminTournament(tournament.id),
    onSuccess: () => {
      setStatus('archived');
      refreshOperations();
    },
  });
  const invite = useMutation({
    mutationFn: (userId: string) => inviteAdminTournamentParticipant(tournament.id, userId),
    onSuccess: () => {
      setInviteSearch('');
      void client.invalidateQueries({ queryKey: participantsKey });
    },
  });
  const pause = useMutation({
    mutationFn: () => pauseAdminTournament(tournament.id, reason),
    onSuccess: () => {
      setStatus('paused');
      refreshOperations();
    },
  });
  const resume = useMutation({
    mutationFn: () => resumeAdminTournament(tournament.id, reason),
    onSuccess: (result) => {
      setStatus(result.status);
      refreshOperations();
    },
  });

  return (
    <section className="tournament-operations">
      <div className="tournament-operations__header">
        <button
          type="button"
          className="icon-btn"
          aria-label="Назад к турнирам"
          title="Назад к турнирам"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="tournament-operations__heading">
          <span>{tournamentStatusLabel(status)}</span>
          <h2>{tournament.title}</h2>
        </div>
        <div className="tournament-operations__actions">
          {status === 'draft' && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Редактировать"
              title="Редактировать"
              onClick={onEdit}
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Дублировать"
            title="Дублировать"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate()}
          >
            <Copy size={16} />
          </button>
          {status === 'draft' && (
            <button
              type="button"
              className="icon-btn icon-btn--dark"
              aria-label="Опубликовать набор"
              title="Опубликовать набор"
              onClick={() => lifecycle.mutate('publish')}
            >
              <Megaphone size={16} />
            </button>
          )}
          {['registration', 'registration_blocked'].includes(status) && (
            <button
              type="button"
              className="icon-btn icon-btn--dark"
              aria-label="Сгенерировать календарь"
              title="Сгенерировать календарь"
              onClick={() => lifecycle.mutate('generate')}
            >
              <CalendarPlus size={16} />
            </button>
          )}
          {status === 'scheduling' && (
            <button
              type="button"
              className="icon-btn icon-btn--dark"
              aria-label="Опубликовать календарь"
              title="Опубликовать календарь"
              onClick={() => lifecycle.mutate('publish_schedule')}
            >
              <CalendarPlus size={16} />
            </button>
          )}
          {status === 'regular' && (
            <button
              type="button"
              className="icon-btn icon-btn--dark"
              aria-label="Запустить плей-офф"
              title="Запустить плей-офф"
              onClick={() => lifecycle.mutate('playoffs')}
            >
              <Trophy size={16} />
            </button>
          )}
          {!['draft', 'paused', 'completed', 'cancelled', 'archived'].includes(status) && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Приостановить"
              title="Приостановить"
              disabled={reason.length < 3 || pause.isPending}
              onClick={() => pause.mutate()}
            >
              <Pause size={16} />
            </button>
          )}
          {status === 'paused' && (
            <button
              type="button"
              className="icon-btn icon-btn--dark"
              aria-label="Возобновить"
              title="Возобновить"
              disabled={reason.length < 3 || resume.isPending}
              onClick={() => resume.mutate()}
            >
              <Play size={16} />
            </button>
          )}
          {!['draft', 'cancelled', 'completed', 'archived'].includes(status) && (
            <button
              type="button"
              className="icon-btn tournament-icon-btn--danger"
              aria-label="Отменить турнир"
              title="Отменить турнир"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              <X size={16} />
            </button>
          )}
          {['cancelled', 'completed'].includes(status) && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Архивировать"
              title="Архивировать"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              <Archive size={16} />
            </button>
          )}
          {status === 'draft' && tournament.participantCount === 0 && !confirmDelete && (
            <button
              type="button"
              className="icon-btn tournament-icon-btn--danger"
              aria-label="Удалить черновик"
              title="Удалить черновик"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} />
            </button>
          )}
          {status === 'draft' && tournament.participantCount === 0 && confirmDelete && (
            <button
              type="button"
              className="icon-btn tournament-icon-btn--danger"
              aria-label="Подтвердить удаление"
              title="Подтвердить удаление"
              disabled={removeDraft.isPending}
              onClick={() => removeDraft.mutate()}
            >
              <Check size={16} />
            </button>
          )}
        </div>
      </div>
      <SegmentedTabs
        ariaLabel="Управление турниром"
        activeTab={tab}
        items={tabs.map((item) => ({ id: item.key, label: item.label }))}
        onChange={setTab}
        scrollable
      />
      <div className="glass tournament-operations__panel">
        {tab === 'participants' && (
          <>
            <label className="tournament-operations__field">
              <span>Причина решения</span>
              <input
                aria-label="Причина решения"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {['draft', 'registration', 'registration_blocked'].includes(status) && (
              <div className="tournament-player-search">
                <input
                  type="search"
                  aria-label="Найти игрока"
                  placeholder="Имя, Telegram ID или VK ID"
                  value={inviteSearch}
                  onChange={(event) => setInviteSearch(event.target.value)}
                />
                {inviteSearch.trim().length >= 2 && (
                  <div className="tournament-player-search__results">
                    {invitedUsers.isLoading && <span>Ищем игроков…</span>}
                    {invitedUsers.data?.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        aria-label={`Пригласить ${user.displayName}`}
                        disabled={user.isBlocked || invite.isPending}
                        onClick={() => invite.mutate(user.id)}
                      >
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" />
                        ) : (
                          <span aria-hidden="true">{user.displayName.slice(0, 1)}</span>
                        )}
                        <strong>{user.displayName}</strong>
                        <UserPlus size={15} />
                      </button>
                    ))}
                    {invitedUsers.isSuccess && invitedUsers.data.users.length === 0 && (
                      <span>Игроки не найдены.</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {participants.data?.participants.map((participant) => (
              <div key={participant.id} className="tournament-participant-admin-row">
                <div className="tournament-participant-admin-row__identity">
                  <strong>{participant.display_name}</strong>
                  <span>
                    {participantStateLabel(participant.state)} ·{' '}
                    {participantPaymentLabel(
                      participant.entry_fee_state,
                      participant.entry_fee_coins,
                    )}
                  </span>
                </div>
                <div className="tournament-participant-admin-row__actions">
                  {['applied', 'invited'].includes(participant.state) && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--dark"
                      aria-label="Одобрить заявку"
                      title="Одобрить заявку"
                      onClick={() => approve.mutate(participant.id)}
                    >
                      <Check size={16} />
                    </button>
                  )}
                  {participant.state === 'approved' && (
                    <button
                      type="button"
                      className="icon-btn tournament-icon-btn--danger"
                      aria-label="Дисквалифицировать"
                      title="Дисквалифицировать"
                      onClick={() => disqualify.mutate(participant.id)}
                    >
                      <Ban size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {participants.data?.participants.length === 0 && (
              <div className="tournament-admin-empty">Заявок пока нет.</div>
            )}
          </>
        )}
        {tab === 'schedule' && (
          <>
            {schedule.isLoading && <div>Загрузка календаря…</div>}
            {schedule.isError && <div role="alert">Не удалось загрузить календарь.</div>}
            {!schedule.isLoading && !schedule.isError && schedule.data?.fixtures.length === 0 && (
              <div className="tournament-admin-empty">Календарь пока пуст.</div>
            )}
            {schedule.data?.fixtures.map((fixture) => (
              <button
                key={fixture.id}
                type="button"
                className="tournament-operation-list-row"
                onClick={() => setSelectedFixture(fixture)}
              >
                №{fixture.fixtureNumber}: {fixture.home?.name ?? 'Соперник не определён'} —{' '}
                {fixture.away?.name ?? 'Соперник не определён'} ·{' '}
                {readableDate(fixture.scheduledStartsAt)} ·{' '}
                {fixtureStatusLabel(fixture.status)}
              </button>
            ))}
            {selectedFixture !== null && (
              <div className="tournament-operation-editor">
                <strong>Операции матча №{selectedFixture.fixtureNumber}</strong>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
                <input value={reason} onChange={(event) => setReason(event.target.value)} />
                <button
                  type="button"
                  className="icon-btn icon-btn--dark"
                  aria-label="Перенести матч"
                  title="Перенести матч"
                  disabled={!startsAt || !endsAt || reason.length < 3 || reschedule.isPending}
                  onClick={() => reschedule.mutate()}
                >
                  <CalendarClock size={16} />
                </button>
                <GlassSelect
                  ariaLabel="Неявка"
                  value={absent}
                  options={[
                    { value: 'home', label: 'Неявка хозяина' },
                    { value: 'away', label: 'Неявка гостя' },
                    { value: 'both', label: 'Двойная неявка' },
                  ]}
                  onChange={setAbsent}
                />
                <button
                  type="button"
                  className="icon-btn tournament-icon-btn--danger"
                  aria-label="Зафиксировать неявку"
                  title="Зафиксировать неявку"
                  disabled={reason.length < 3 || noShow.isPending}
                  onClick={() => noShow.mutate()}
                >
                  <UserX size={16} />
                </button>
              </div>
            )}
          </>
        )}
        {tab === 'standings' &&
          (standings.data?.standings.length ? (
            standings.data.standings.map((row, index) => (
              <div key={String(row.user_id ?? index)}>
                {index + 1}. {rowLabel(row, index)} · {String(row.points ?? 0)} очков
              </div>
            ))
          ) : (
            <div className="tournament-admin-empty">Таблица пуста.</div>
          ))}
        {tab === 'bracket' &&
          (bracket.data?.series.length ? (
            bracket.data.series.map((row, index) => (
              <div key={String(row.id ?? index)}>
                {rowLabel(row, index)} · {fixtureStatusLabel(String(row.status ?? 'conditional'))}
              </div>
            ))
          ) : (
            <div className="tournament-admin-empty">Сетка ещё не создана.</div>
          ))}
        {tab === 'rewards' && (
          <>
            <div className="tournament-reward-actions">
              <button
                type="button"
                className="icon-btn icon-btn--dark"
                aria-label="Выдать награды регулярки"
                title="Выдать награды регулярки"
                disabled={reward.isPending}
                onClick={() => reward.mutate('regular')}
              >
                <Award size={16} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--dark"
                aria-label="Выдать награды плей-офф"
                title="Выдать награды плей-офф"
                disabled={reward.isPending}
                onClick={() => reward.mutate('playoff')}
              >
                <Trophy size={16} />
              </button>
            </div>
            <div className="tournament-operations__hint">
              Можно запускать повторно: уже выданные награды не продублируются.
            </div>
          </>
        )}
        {tab === 'dispatches' && (
          <>
            <label className="tournament-operations__field">
              <span>Аудитория</span>
              <GlassSelect
                ariaLabel="Аудитория"
                value={audience}
                options={[
                  { value: 'approved', label: 'Подтверждённые участники' },
                  { value: 'all_participants', label: 'Все заявки и участники' },
                ]}
                onChange={setAudience}
              />
            </label>
            <div className="tournament-dispatch-recipient-count">
              Получателей: {audiencePreview.data?.count ?? '…'}
            </div>
            <label className="tournament-operations__field">
              <span>Канал</span>
              <GlassSelect
                ariaLabel="Канал"
                value={dispatchKind}
                options={[
                  { value: 'push', label: 'Push' },
                  { value: 'direct_message', label: 'Личные сообщения' },
                  { value: 'official_news', label: 'Официальный канал новостей' },
                ]}
                onChange={setDispatchKind}
              />
            </label>
            <label className="tournament-operations__field">
              <span>Сообщение</span>
              <textarea
                aria-label="Сообщение"
                className="tournament-dispatch-message"
                placeholder="Напишите сообщение участникам"
                value={dispatchBody}
                onChange={(event) => setDispatchBody(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="admin-compact-btn tournament-dispatch-submit"
              disabled={!dispatchBody.trim() || dispatch.isPending}
              onClick={() => dispatch.mutate()}
            >
              Отправить рассылку
            </button>
            {dispatches.data?.dispatches.map((item, index) => (
              <div className="tournament-dispatch-history-row" key={String(item.id ?? index)}>
                {dispatchKindLabel(item.kind)} · {dispatchStatusLabel(item.status)} · доставлено{' '}
                {String(item.delivered_count ?? 0)} / {String(item.recipient_count ?? 0)}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
