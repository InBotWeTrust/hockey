import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
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
  inviteAdminTournamentParticipant,
  pauseAdminTournament,
  previewAdminTournamentAudience,
  publishAdminTournament,
  publishAdminTournamentSchedule,
  resolveAdminTournamentNoShow,
  resumeAdminTournament,
  rescheduleAdminTournamentFixture,
  startAdminTournamentPlayoffs,
  updateAdminTournamentRewards,
  type AdminTournament,
  type AdminTournamentFixture,
  type AdminTournamentParticipant,
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

function tournamentDate(value: string | null | undefined, timezone: string): string {
  if (!value) return 'Не задано';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Не задано';
  try {
    return `${new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)} (${timezone})`;
  } catch {
    return date.toLocaleString('ru-RU');
  }
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

type RewardStage = 'regular' | 'playoff';
type RewardRow = { place: number; experience: number; coins: number; stars: number };

function tournamentRewardRows(tournament: AdminTournament, stage: RewardStage): RewardRow[] {
  const stageRewards =
    typeof tournament.rules?.stageRewards === 'object' &&
    tournament.rules.stageRewards !== null &&
    !Array.isArray(tournament.rules.stageRewards)
      ? (tournament.rules.stageRewards as Record<string, unknown>)
      : {};
  const rows = Array.isArray(stageRewards[stage]) ? stageRewards[stage] : [];
  return rows.flatMap((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    const place = Number(row.place);
    if (!Number.isInteger(place) || place < 1) return [];
    return [
      {
        place,
        experience: Math.max(0, Number(row.experience) || 0),
        coins: Math.max(0, Number(row.coins) || 0),
        stars: Math.max(0, Number(row.stars) || 0),
      },
    ];
  });
}

function RewardStageTable({
  title,
  rows,
  editing,
  paid,
  onChange,
}: {
  title: string;
  rows: RewardRow[];
  editing: boolean;
  paid: boolean;
  onChange: (rows: RewardRow[]) => void;
}): JSX.Element {
  const change = (index: number, field: keyof RewardRow, value: number) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  };
  return (
    <section className="tournament-operation-rewards">
      <div className="tournament-operation-rewards__heading">
        <strong>{title}</strong>
        <span>{paid ? 'Выплачены' : 'Ещё не выплачены'}</span>
      </div>
      {rows.length === 0 && !editing && (
        <div className="tournament-admin-empty">Призы пока не назначены.</div>
      )}
      {rows.length > 0 && (
        <div className="tournament-operation-rewards__table">
          <div className="tournament-operation-rewards__labels">
            <span>Место</span>
            <span>Опыт</span>
            <span>Монеты</span>
            <span>Звёзды</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div key={`${row.place}:${index}`} className="tournament-operation-rewards__row">
              {(['place', 'experience', 'coins', 'stars'] as const).map((field) =>
                editing && !paid ? (
                  <input
                    key={field}
                    type="number"
                    min={field === 'place' ? 1 : 0}
                    aria-label={`${title}: ${field} ${index + 1}`}
                    value={row[field]}
                    onChange={(event) => change(index, field, Number(event.target.value))}
                  />
                ) : (
                  <span key={field}>{row[field]}</span>
                ),
              )}
              {editing && !paid ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Удалить награду: ${title}, место ${row.place}`}
                  onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <X size={13} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      {editing && !paid && (
        <button
          type="button"
          className="admin-compact-btn"
          onClick={() =>
            onChange([...rows, { place: rows.length + 1, experience: 0, coins: 0, stars: 0 }])
          }
        >
          Добавить место
        </button>
      )}
    </section>
  );
}

export function TournamentOperations({
  tournament,
  onBack,
  onEdit,
  onRemoved,
}: {
  tournament: AdminTournament;
  onBack: () => void;
  onEdit: (stage?: number) => void;
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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<AdminTournamentParticipant | null>(
    null,
  );
  const [editingRewards, setEditingRewards] = useState(false);
  const [rewardRevision, setRewardRevision] = useState(tournament.revision);
  const [regularRewards, setRegularRewards] = useState(() =>
    tournamentRewardRows(tournament, 'regular'),
  );
  const [playoffRewards, setPlayoffRewards] = useState(() =>
    tournamentRewardRows(tournament, 'playoff'),
  );
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
    onSuccess: () => {
      setSelectedParticipant(null);
      return client.invalidateQueries({ queryKey: participantsKey });
    },
  });
  const disqualify = useMutation({
    mutationFn: (participantId: string) =>
      disqualifyAdminTournamentParticipant(tournament.id, participantId, reason),
    onSuccess: () => {
      setSelectedParticipant(null);
      return client.invalidateQueries({ queryKey: participantsKey });
    },
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
  const rewards = useMutation({
    mutationFn: () =>
      updateAdminTournamentRewards(tournament.id, rewardRevision, {
        ...(tournament.rewardEditability?.regular !== 'paid' ? { regular: regularRewards } : {}),
        ...(tournament.rewardEditability?.playoff !== 'paid' ? { playoff: playoffRewards } : {}),
      }),
    onSuccess: ({ tournament: updated }) => {
      setRewardRevision(updated.revision);
      setRegularRewards(tournamentRewardRows(updated, 'regular'));
      setPlayoffRewards(tournamentRewardRows(updated, 'playoff'));
      setEditingRewards(false);
      refreshOperations();
    },
  });

  const panelIsEmpty =
    (tab === 'schedule' &&
      !schedule.isLoading &&
      !schedule.isError &&
      schedule.data?.fixtures.length === 0) ||
    (tab === 'standings' && standings.data?.standings.length === 0) ||
    (tab === 'bracket' && bracket.data?.series.length === 0);
  const canEditRules = ['draft', 'registration', 'registration_blocked'].includes(status);
  const tournamentTimezone = String(tournament.rules?.config?.timezone ?? 'Europe/Moscow');
  const registrationOpensAt = tournament.registrationOpensAt
    ? new Date(tournament.registrationOpensAt)
    : null;
  const registrationClosesAt = tournament.registrationClosesAt
    ? new Date(tournament.registrationClosesAt)
    : null;
  const tournamentStartsAt = tournament.startsAt ? new Date(tournament.startsAt) : null;
  const datesReady =
    registrationOpensAt !== null &&
    registrationClosesAt !== null &&
    tournamentStartsAt !== null &&
    Number.isFinite(registrationOpensAt.getTime()) &&
    Number.isFinite(registrationClosesAt.getTime()) &&
    Number.isFinite(tournamentStartsAt.getTime()) &&
    registrationOpensAt < registrationClosesAt &&
    registrationClosesAt < tournamentStartsAt;

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
          {canEditRules && (
            <button type="button" className="admin-compact-btn" onClick={() => onEdit(0)}>
              Редактировать
            </button>
          )}
          <button
            type="button"
            className="admin-compact-btn tournament-operations__actions-trigger"
            onClick={() => setActionsOpen(true)}
          >
            Действия
          </button>
        </div>
      </div>
      <SegmentedTabs
        ariaLabel="Управление турниром"
        activeTab={tab}
        items={tabs.map((item) => ({ id: item.key, label: item.label }))}
        onChange={setTab}
        scrollable
      />
      <div
        className={
          panelIsEmpty ? 'tournament-operations__empty-panel' : 'glass tournament-operations__panel'
        }
      >
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
                        <span>Пригласить</span>
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
              <button
                key={participant.id}
                type="button"
                className="tournament-participant-admin-row"
                aria-label={`Управление: ${participant.display_name}`}
                onClick={() => setSelectedParticipant(participant)}
              >
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
                <span className="tournament-participant-admin-row__manage">Управление</span>
              </button>
            ))}
            {participants.data?.participants.length === 0 && (
              <div className="tournament-admin-empty">Заявок пока нет.</div>
            )}
          </>
        )}
        {tab === 'schedule' && (
          <>
            <dl className="tournament-operation-dates">
              <div>
                <dt>Открытие регистрации</dt>
                <dd>{tournamentDate(tournament.registrationOpensAt, tournamentTimezone)}</dd>
              </div>
              <div>
                <dt>Закрытие регистрации</dt>
                <dd>{tournamentDate(tournament.registrationClosesAt, tournamentTimezone)}</dd>
              </div>
              <div>
                <dt>Первый турнирный день</dt>
                <dd>{tournamentDate(tournament.startsAt, tournamentTimezone)}</dd>
              </div>
              <div>
                <dt>{tournament.completedAt ? 'Завершён' : 'Плановое окончание'}</dt>
                <dd>
                  {tournamentDate(
                    tournament.completedAt ?? tournament.projectedEndsAt,
                    tournamentTimezone,
                  )}
                </dd>
              </div>
            </dl>
            {canEditRules && (
              <button
                type="button"
                className="admin-compact-btn tournament-operations__quick-edit"
                onClick={() => onEdit(4)}
              >
                Изменить сроки
              </button>
            )}
            {!canEditRules && (
              <div className="tournament-operation-hint">
                Календарь уже опубликован. Чтобы изменить время, выберите конкретную игру и укажите
                причину переноса — участники получат уведомление.
              </div>
            )}
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
                {readableDate(fixture.scheduledStartsAt)} · {fixtureStatusLabel(fixture.status)}
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
                  className="admin-compact-btn"
                  disabled={!startsAt || !endsAt || reason.length < 3 || reschedule.isPending}
                  onClick={() => reschedule.mutate()}
                >
                  Перенести матч
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
                  className="admin-compact-btn admin-compact-btn--danger"
                  disabled={reason.length < 3 || noShow.isPending}
                  onClick={() => noShow.mutate()}
                >
                  Зафиксировать неявку
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
          <div className="tournament-reward-status">
            <div className="tournament-reward-status__header">
              <div>
                <strong>Награды выдаются автоматически.</strong>
                <span>Регулярка — при переходе в плей-офф, плей-офф — после финала.</span>
              </div>
              <button
                type="button"
                className="admin-compact-btn"
                onClick={() => {
                  if (status === 'draft') onEdit(5);
                  else setEditingRewards((value) => !value);
                }}
              >
                Изменить награды
              </button>
            </div>
            <RewardStageTable
              title="Регулярный чемпионат"
              rows={regularRewards}
              editing={editingRewards}
              paid={tournament.rewardEditability?.regular === 'paid'}
              onChange={setRegularRewards}
            />
            <RewardStageTable
              title="Плей-офф"
              rows={playoffRewards}
              editing={editingRewards}
              paid={tournament.rewardEditability?.playoff === 'paid'}
              onChange={setPlayoffRewards}
            />
            {editingRewards && status !== 'draft' && (
              <div className="tournament-reward-status__actions">
                <button
                  type="button"
                  className="admin-compact-btn"
                  onClick={() => setEditingRewards(false)}
                  disabled={rewards.isPending}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="admin-compact-btn admin-compact-btn--primary"
                  onClick={() => rewards.mutate()}
                  disabled={rewards.isPending}
                >
                  Сохранить награды
                </button>
              </div>
            )}
            {rewards.isError && (
              <div role="alert">Не удалось сохранить награды. Обновите страницу и повторите.</div>
            )}
          </div>
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
                onChange={(event) => {
                  dispatch.reset();
                  setDispatchBody(event.target.value);
                }}
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
            {dispatch.isError && (
              <div
                className="tournament-dispatch-feedback tournament-dispatch-feedback--error"
                role="alert"
              >
                Не удалось отправить рассылку. Попробуйте ещё раз.
              </div>
            )}
            {dispatch.isSuccess && (
              <div className="tournament-dispatch-feedback" role="status">
                {dispatch.data.failed === 0
                  ? `Рассылка отправлена: ${dispatch.data.delivered} из ${dispatch.data.recipients}.`
                  : `Доставлено ${dispatch.data.delivered} из ${dispatch.data.recipients}. Не удалось отправить: ${dispatch.data.failed}.`}
              </div>
            )}
            {dispatches.data?.dispatches.map((item, index) => (
              <div className="tournament-dispatch-history-row" key={String(item.id ?? index)}>
                {dispatchKindLabel(item.kind)} · {dispatchStatusLabel(item.status)} · доставлено{' '}
                {String(item.delivered_count ?? 0)} / {String(item.recipient_count ?? 0)}
              </div>
            ))}
          </>
        )}
      </div>
      {actionsOpen && (
        <AccessibleModal
          title="Действия турнира"
          ariaLabel="Действия турнира"
          onClose={() => setActionsOpen(false)}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть действия турнира"
              onClick={() => setActionsOpen(false)}
            >
              <X size={16} />
            </button>
          }
        >
          <div className="tournament-action-list">
            {canEditRules && (
              <button
                type="button"
                className="admin-compact-btn"
                onClick={() => {
                  setActionsOpen(false);
                  onEdit();
                }}
              >
                Редактировать турнир
              </button>
            )}
            <button
              type="button"
              className="admin-compact-btn"
              disabled={duplicate.isPending}
              onClick={() => {
                setActionsOpen(false);
                duplicate.mutate();
              }}
            >
              Дублировать турнир
            </button>
            {status === 'draft' && (
              <>
                <button
                  type="button"
                  className="admin-compact-btn"
                  disabled={!datesReady || lifecycle.isPending}
                  onClick={() => {
                    setActionsOpen(false);
                    lifecycle.mutate('publish');
                  }}
                >
                  Открыть регистрацию
                </button>
                {!datesReady && (
                  <div className="tournament-operation-hint">
                    Сначала укажите открытие и закрытие регистрации и первый турнирный день.
                    Порядок: открытие → закрытие → старт.
                  </div>
                )}
              </>
            )}
            {['registration', 'registration_blocked'].includes(status) && (
              <button
                type="button"
                className="admin-compact-btn"
                onClick={() => {
                  setActionsOpen(false);
                  lifecycle.mutate('generate');
                }}
              >
                Создать календарь
              </button>
            )}
            {status === 'scheduling' && (
              <button
                type="button"
                className="admin-compact-btn"
                onClick={() => {
                  setActionsOpen(false);
                  lifecycle.mutate('publish_schedule');
                }}
              >
                Опубликовать календарь
              </button>
            )}
            {status === 'regular' && (
              <button
                type="button"
                className="admin-compact-btn"
                onClick={() => {
                  setActionsOpen(false);
                  lifecycle.mutate('playoffs');
                }}
              >
                Запустить плей-офф
              </button>
            )}
            {!['draft', 'paused', 'completed', 'cancelled', 'archived'].includes(status) && (
              <button
                type="button"
                className="admin-compact-btn"
                disabled={reason.length < 3 || pause.isPending}
                onClick={() => {
                  setActionsOpen(false);
                  pause.mutate();
                }}
              >
                Приостановить турнир
              </button>
            )}
            {status === 'paused' && (
              <button
                type="button"
                className="admin-compact-btn"
                disabled={reason.length < 3 || resume.isPending}
                onClick={() => {
                  setActionsOpen(false);
                  resume.mutate();
                }}
              >
                Возобновить турнир
              </button>
            )}
            {!['draft', 'cancelled', 'completed', 'archived'].includes(status) && (
              <button
                type="button"
                className="admin-compact-btn admin-compact-btn--danger"
                disabled={cancel.isPending}
                onClick={() => {
                  setActionsOpen(false);
                  cancel.mutate();
                }}
              >
                Отменить турнир
              </button>
            )}
            {['cancelled', 'completed'].includes(status) && (
              <button
                type="button"
                className="admin-compact-btn"
                disabled={archive.isPending}
                onClick={() => {
                  setActionsOpen(false);
                  archive.mutate();
                }}
              >
                Архивировать турнир
              </button>
            )}
            {status === 'draft' && tournament.participantCount === 0 && (
              <button
                type="button"
                className="admin-compact-btn admin-compact-btn--danger"
                disabled={removeDraft.isPending}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  setActionsOpen(false);
                  removeDraft.mutate();
                }}
              >
                {confirmDelete ? 'Подтвердить удаление черновика' : 'Удалить черновик'}
              </button>
            )}
          </div>
        </AccessibleModal>
      )}
      {selectedParticipant !== null && (
        <AccessibleModal
          title={selectedParticipant.display_name}
          ariaLabel={selectedParticipant.display_name}
          onClose={() => setSelectedParticipant(null)}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть управление участником"
              onClick={() => setSelectedParticipant(null)}
            >
              <X size={16} />
            </button>
          }
        >
          <div className="tournament-participant-actions">
            <p>
              {participantStateLabel(selectedParticipant.state)} ·{' '}
              {participantPaymentLabel(
                selectedParticipant.entry_fee_state,
                selectedParticipant.entry_fee_coins,
              )}
            </p>
            {['applied', 'invited'].includes(selectedParticipant.state) && (
              <button
                type="button"
                className="admin-compact-btn"
                disabled={approve.isPending}
                onClick={() => approve.mutate(selectedParticipant.id)}
              >
                Одобрить заявку
              </button>
            )}
            {selectedParticipant.state === 'approved' && (
              <button
                type="button"
                className="admin-compact-btn admin-compact-btn--danger"
                disabled={reason.length < 3 || disqualify.isPending}
                onClick={() => disqualify.mutate(selectedParticipant.id)}
              >
                Дисквалифицировать участника
              </button>
            )}
          </div>
        </AccessibleModal>
      )}
    </section>
  );
}
