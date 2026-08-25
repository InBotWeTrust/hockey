import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  approveAdminTournamentParticipant,
  dispatchAdminTournamentCommunication,
  disqualifyAdminTournamentParticipant,
  fetchAdminTournamentBracket,
  fetchAdminTournamentDispatches,
  fetchAdminTournamentParticipants,
  fetchAdminTournamentSchedule,
  fetchAdminTournamentStandings,
  generateAdminTournamentSchedule,
  grantAdminTournamentRewards,
  previewAdminTournamentAudience,
  publishAdminTournament,
  publishAdminTournamentSchedule,
  resolveAdminTournamentNoShow,
  rescheduleAdminTournamentFixture,
  startAdminTournamentPlayoffs,
  type AdminTournament,
  type AdminTournamentFixture,
} from './adminApi.js';

type OperationsTab = 'participants' | 'schedule' | 'standings' | 'bracket' | 'rewards' | 'dispatches';

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
  return String(
    row.display_name ?? row.higher_name ?? row.user_id ?? row.id ?? `Строка ${index + 1}`,
  );
}

export function TournamentOperations({
  tournament,
  onBack,
}: {
  tournament: AdminTournament;
  onBack: () => void;
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
  const [dispatchKind, setDispatchKind] = useState<'push' | 'direct_message'>('push');
  const [dispatchTitle, setDispatchTitle] = useState('');
  const [dispatchBody, setDispatchBody] = useState('');
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

  const refreshOperations = () => {
    void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    void client.invalidateQueries({ queryKey: ['admin', 'tournaments', tournament.id] });
  };
  const lifecycle = useMutation({
    mutationFn: (action: 'publish' | 'generate' | 'publish_schedule' | 'playoffs') => {
      if (action === 'publish') return publishAdminTournament(tournament.id, tournament.revision);
      if (action === 'generate') return generateAdminTournamentSchedule(tournament.id, tournament.revision);
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
        title: dispatchTitle,
        body: dispatchBody,
      }),
    onSuccess: () => {
      setDispatchTitle('');
      setDispatchBody('');
      void client.invalidateQueries({ queryKey: dispatchesKey });
    },
  });

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="btn btn--ghost" onClick={onBack}>К списку турниров</button>
      <div className="glass" style={{ borderRadius: 22, padding: 16 }}>
        <div className="section-label" style={{ margin: 0 }}>{status} · ревизия {tournament.revision}</div>
        <h2 style={{ margin: '5px 0 0' }}>{tournament.title}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {status === 'draft' && <button type="button" className="btn btn--cta" onClick={() => lifecycle.mutate('publish')}>Опубликовать набор</button>}
          {['registration', 'registration_blocked'].includes(status) && <button type="button" className="btn btn--cta" onClick={() => lifecycle.mutate('generate')}>Сгенерировать календарь</button>}
          {status === 'scheduling' && <button type="button" className="btn btn--cta" onClick={() => lifecycle.mutate('publish_schedule')}>Опубликовать календарь</button>}
          {status === 'regular' && <button type="button" className="btn btn--cta" onClick={() => lifecycle.mutate('playoffs')}>Запустить плей-офф</button>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {tabs.map((item) => <button key={item.key} type="button" className={tab === item.key ? 'btn btn--cta' : 'btn btn--ghost'} style={{ minWidth: 'max-content' }} onClick={() => setTab(item.key)}>{item.label}</button>)}
      </div>
      <div className="glass" style={{ borderRadius: 22, padding: 16, display: 'grid', gap: 10 }}>
        {tab === 'participants' && (
          <>
            <label>Причина административного решения<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            {participants.data?.participants.map((participant) => (
              <div key={participant.id} style={{ padding: 10, borderRadius: 14, background: 'rgba(255,255,255,.55)' }}>
                <div style={{ fontWeight: 850 }}>{participant.display_name}</div>
                <div style={{ color: 'var(--muted)' }}>{participant.state} · взнос {participant.entry_fee_coins} · {participant.entry_fee_state}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {['applied', 'invited'].includes(participant.state) && <button type="button" className="btn btn--cta" onClick={() => approve.mutate(participant.id)}>Одобрить заявку</button>}
                  {participant.state === 'approved' && <button type="button" className="btn btn--ghost" onClick={() => disqualify.mutate(participant.id)}>Дисквалифицировать</button>}
                </div>
              </div>
            ))}
            {participants.data?.participants.length === 0 && <div>Заявок пока нет.</div>}
          </>
        )}
        {tab === 'schedule' && (
          <>
            {schedule.isLoading && <div>Загрузка календаря…</div>}
            {schedule.isError && <div role="alert">Не удалось загрузить календарь.</div>}
            {!schedule.isLoading && !schedule.isError && schedule.data?.fixtures.length === 0 && <div>Календарь пока пуст.</div>}
            {schedule.data?.fixtures.map((fixture) => (
              <button key={fixture.id} type="button" className="glass" style={{ padding: 10, borderRadius: 14, textAlign: 'left' }} onClick={() => setSelectedFixture(fixture)}>
                №{fixture.fixtureNumber}: {fixture.home?.name ?? 'TBD'} — {fixture.away?.name ?? 'TBD'} · {readableDate(fixture.scheduledStartsAt)} · {fixture.status}
              </button>
            ))}
            {selectedFixture !== null && (
              <div style={{ display: 'grid', gap: 8 }}>
                <strong>Операции матча №{selectedFixture.fixtureNumber}</strong>
                <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
                <input value={reason} onChange={(event) => setReason(event.target.value)} />
                <button type="button" className="btn btn--cta" disabled={!startsAt || !endsAt || reason.length < 3} onClick={() => reschedule.mutate()}>Перенести матч</button>
                <select value={absent} onChange={(event) => setAbsent(event.target.value as typeof absent)}><option value="home">Неявка хозяина</option><option value="away">Неявка гостя</option><option value="both">Двойная неявка</option></select>
                <button type="button" className="btn btn--ghost" disabled={reason.length < 3} onClick={() => noShow.mutate()}>Зафиксировать неявку</button>
              </div>
            )}
          </>
        )}
        {tab === 'standings' && (standings.data?.standings.length ? standings.data.standings.map((row, index) => <div key={String(row.user_id ?? index)}>{index + 1}. {rowLabel(row, index)} · {String(row.points ?? 0)} очков</div>) : <div>Таблица пуста.</div>)}
        {tab === 'bracket' && (bracket.data?.series.length ? bracket.data.series.map((row, index) => <div key={String(row.id ?? index)}>{rowLabel(row, index)} · {String(row.status ?? 'pending')}</div>) : <div>Сетка ещё не создана.</div>)}
        {tab === 'rewards' && <><button type="button" className="btn btn--cta" onClick={() => reward.mutate('regular')}>Выдать награды регулярки</button><button type="button" className="btn btn--cta" onClick={() => reward.mutate('playoff')}>Выдать награды плей-офф</button><div>Повторный запуск безопасен: сервер использует idempotency key для каждого места и участника.</div></>}
        {tab === 'dispatches' && (
          <>
            <label>Аудитория<select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="approved">Подтверждённые участники</option><option value="all_participants">Все заявки и участники</option></select></label>
            <div>Получателей: {audiencePreview.data?.count ?? '…'}</div>
            <label>Канал<select value={dispatchKind} onChange={(event) => setDispatchKind(event.target.value as typeof dispatchKind)}><option value="push">Push</option><option value="direct_message">Личные сообщения</option></select></label>
            <input placeholder="Заголовок" value={dispatchTitle} onChange={(event) => setDispatchTitle(event.target.value)} />
            <textarea placeholder="Текст сообщения" value={dispatchBody} onChange={(event) => setDispatchBody(event.target.value)} />
            <button type="button" className="btn btn--cta" disabled={!dispatchTitle || !dispatchBody || dispatch.isPending} onClick={() => dispatch.mutate()}>Отправить рассылку</button>
            {dispatches.data?.dispatches.map((item, index) => <div key={String(item.id ?? index)}>{String(item.kind ?? 'dispatch')} · {String(item.status ?? 'pending')} · доставлено {String(item.delivered_count ?? 0)} / {String(item.recipient_count ?? 0)}</div>)}
          </>
        )}
      </div>
    </section>
  );
}
