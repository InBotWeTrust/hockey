import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  applyToTournament,
  fetchTournamentSchedule,
  fetchTournamentStandings,
  fetchTournaments,
  openTournamentFixtureSegment,
  withdrawFromTournament,
  type TournamentSummary,
} from '../api/tournament.js';

type TournamentTab = 'overview' | 'standings' | 'schedule' | 'playoff' | 'rules';

const tabs: Array<{ key: TournamentTab; label: string }> = [
  { key: 'overview', label: 'Обзор' },
  { key: 'standings', label: 'Таблица' },
  { key: 'schedule', label: 'Расписание' },
  { key: 'playoff', label: 'Плей-офф' },
  { key: 'rules', label: 'Правила и призы' },
];

function statusLabel(status: TournamentSummary['status']): string {
  const labels: Record<TournamentSummary['status'], string> = {
    registration: 'Идёт регистрация',
    registration_blocked: 'Набор продлён',
    scheduling: 'Готовится расписание',
    regular: 'Регулярный чемпионат',
    playoff: 'Плей-офф',
    paused: 'Приостановлен',
    completed: 'Завершён',
    cancelled: 'Отменён',
  };
  return labels[status];
}

function TournamentDetails({ tournament, onBack }: { tournament: TournamentSummary; onBack: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TournamentTab>('overview');
  const queryClient = useQueryClient();
  const schedule = useQuery({
    queryKey: ['tournaments', tournament.id, 'schedule'],
    queryFn: () => fetchTournamentSchedule(tournament.id),
    enabled: tab === 'schedule',
  });
  const standings = useQuery({
    queryKey: ['tournaments', tournament.id, 'standings'],
    queryFn: () => fetchTournamentStandings(tournament.id),
    enabled: tab === 'standings',
  });
  const registration = useMutation({
    mutationFn: async () => {
      if (tournament.myParticipantState === null) await applyToTournament(tournament.id);
      else await withdrawFromTournament(tournament.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  });
  const openFixture = useMutation({
    mutationFn: (fixtureId: string) => openTournamentFixtureSegment(tournament.id, fixtureId),
    onSuccess: (segment) => {
      navigate(`/?view=amateur&match=${encodeURIComponent(segment.duelMatchId)}&play=1`);
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button type="button" className="btn btn--ghost" onClick={onBack}>К списку турниров</button>
      <section className="glass" style={{ borderRadius: 22, padding: 16 }}>
        <div className="section-label" style={{ margin: 0 }}>{statusLabel(tournament.status)}</div>
        <h2 style={{ margin: '6px 0', color: 'var(--ink)', fontSize: 23 }}>{tournament.title}</h2>
        <div style={{ color: 'var(--muted)', fontWeight: 700 }}>{tournament.description}</div>
      </section>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'btn btn--cta' : 'btn btn--ghost'}
            style={{ minWidth: 'max-content', padding: '9px 12px' }}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="glass" style={{ borderRadius: 22, padding: 16, minHeight: 150 }}>
        {tab === 'overview' && (
          <div style={{ display: 'grid', gap: 8, color: 'var(--ink)', fontWeight: 750 }}>
            <div>{tournament.participantCount} / {tournament.rules.config.participantLimit} участников</div>
            <div>Плей-офф: {tournament.rules.config.playoffSize} игроков</div>
            <div>Взнос: {tournament.rules.config.entryFeeCoins === 0 ? 'бесплатно' : `${tournament.rules.config.entryFeeCoins} монет`}</div>
          </div>
        )}
        {tab === 'standings' && (
          standings.isLoading ? <div>Загрузка таблицы…</div> :
            standings.data?.standings.length ? standings.data.standings.map((row, index) => <div key={index}>{String(row.display_name ?? row.user_id ?? index + 1)}</div>) : <div>Таблица появится после первых результатов.</div>
        )}
        {tab === 'schedule' && (
          schedule.isLoading ? <div>Загрузка расписания…</div> :
            schedule.data?.fixtures.length ? schedule.data.fixtures.map((fixture) => (
              <div key={fixture.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(100,116,139,.15)' }}>
                {fixture.home?.name ?? 'Участник'} — {fixture.away?.name ?? 'Участник'}
                {(fixture.status === 'scheduled' || fixture.status === 'open' || fixture.status === 'active') && (
                  <button type="button" className="btn btn--cta" style={{ marginTop: 6 }} onClick={() => openFixture.mutate(fixture.id)}>Играть fixture</button>
                )}
              </div>
            )) : <div>Расписание ещё не опубликовано.</div>
        )}
        {tab === 'playoff' && <div>Сетка появится после завершения регулярного чемпионата.</div>}
        {tab === 'rules' && <div>Опубликованная ревизия правил: №{tournament.revision}. После старта она не изменяется.</div>}
      </section>
      {tournament.status === 'registration' && (
        <button type="button" className="btn btn--cta" disabled={registration.isPending} onClick={() => registration.mutate()}>
          {tournament.myParticipantState === null ? 'Подать заявку' : 'Отменить заявку'}
        </button>
      )}
    </div>
  );
}

export function TournamentCatalog(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ['tournaments'], queryFn: fetchTournaments });
  const tournaments = catalog.data?.tournaments ?? [];
  const selected = tournaments.find((tournament) => tournament.id === selectedId);
  if (selected) return <TournamentDetails tournament={selected} onBack={() => setSelectedId(null)} />;
  if (catalog.isLoading) return <div role="status">Загрузка турниров…</div>;
  if (catalog.isError) return <div role="status">Турниры пока недоступны.</div>;
  if (tournaments.length === 0) return <div role="status">Сейчас нет открытых турниров.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {tournaments.map((tournament) => (
        <button
          key={tournament.id}
          type="button"
          aria-label={`Открыть ${tournament.title}`}
          className="glass"
          onClick={() => setSelectedId(tournament.id)}
          style={{ borderRadius: 22, padding: 16, textAlign: 'left', border: '1px solid rgba(255,255,255,.78)' }}
        >
          <span className="section-label" style={{ display: 'block', margin: 0 }}>{statusLabel(tournament.status)}</span>
          <span style={{ display: 'block', marginTop: 6, color: 'var(--ink)', fontSize: 19, fontWeight: 900 }}>{tournament.title}</span>
          <span style={{ display: 'block', marginTop: 5, color: 'var(--muted)', fontWeight: 700 }}>{tournament.participantCount} / {tournament.rules.config.participantLimit} участников</span>
        </button>
      ))}
    </div>
  );
}
