import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchFixtureLiveState,
  proposeFixtureLiveTime,
  respondFixtureLiveProposal,
  type TournamentFixture,
  type TournamentFixtureLiveOverlapWarning,
  type TournamentLiveState,
} from '../api/tournament.js';
import { refreshAccessToken } from '../api/apiFetch.js';
import { useAuthStore } from '../auth/authStore.js';
import {
  TournamentSocket,
  type TournamentSocketStatus,
} from './TournamentSocket.js';

interface TournamentFixtureLiveProps {
  fixture: TournamentFixture;
  onBack: () => void;
  onPlay: () => void;
}

function connectionLabel(status: TournamentSocketStatus): string {
  switch (status) {
    case 'open':
      return 'Соединение установлено';
    case 'connecting':
      return 'Подключаем live-соединение…';
    case 'reconnecting':
      return 'Восстанавливаем live-соединение…';
    case 'closed':
      return 'Live-соединение недоступно, данные обновляются через HTTP';
  }
}

function participantName(fixture: TournamentFixture, userId: string): string {
  if (fixture.home?.userId === userId) return fixture.home.name ?? 'Хозяин';
  if (fixture.away?.userId === userId) return fixture.away.name ?? 'Гость';
  return 'Участник';
}

function formatDate(value: string | null): string {
  if (value === null) return 'Время не согласовано';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Время не согласовано';
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function localDateTimeInputValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const part = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function overlapTime(warning: TournamentFixtureLiveOverlapWarning): string {
  if (warning.acceptedLiveAt !== null)
    return `согласованное время: ${formatDate(warning.acceptedLiveAt)}`;
  return `окно: ${formatDate(warning.scheduledStartsAt)} — ${formatDate(warning.windowEndsAt)}`;
}

export function TournamentFixtureLive({
  fixture,
  onBack,
  onPlay,
}: TournamentFixtureLiveProps): JSX.Element {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const [socketStatus, setSocketStatus] = useState<TournamentSocketStatus>('closed');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [proposedAt, setProposedAt] = useState('');
  const queryKey = useMemo(() => ['tournaments', 'fixtures', fixture.id, 'live'] as const, [fixture.id]);
  const liveQuery = useQuery({
    queryKey,
    queryFn: () => fetchFixtureLiveState(fixture.id),
    refetchInterval: 5_000,
  });
  const live = liveQuery.data?.live ?? null;

  useEffect(() => {
    if (accessToken === null) {
      setSocketStatus('closed');
      return;
    }
    const socket = new TournamentSocket({
      fixtureId: fixture.id,
      getToken: () => useAuthStore.getState().accessToken,
      refresh: refreshAccessToken,
      onStatus: setSocketStatus,
      onEvent: (event) => {
        if (event.type === 'tournament:presence') {
          const userId = typeof event.payload.userId === 'string' ? event.payload.userId : null;
          const online = event.payload.online === true;
          if (userId !== null) {
            setOnlineUserIds((current) => {
              const next = new Set(current);
              if (online) next.add(userId);
              else next.delete(userId);
              return next;
            });
          }
          return;
        }
        const snapshot = event.payload.live;
        if (typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot)) {
          queryClient.setQueryData<{ live: TournamentLiveState | null }>(queryKey, {
            live: snapshot as TournamentLiveState,
          });
          return;
        }
        void queryClient.invalidateQueries({ queryKey });
      },
    });
    socket.connect();
    return () => socket.disconnect();
  }, [accessToken, fixture.id, queryClient, queryKey]);

  const respond = useMutation({
    mutationFn: ({ proposalId, accept }: { proposalId: string; accept: boolean }) =>
      respondFixtureLiveProposal(fixture.id, proposalId, accept),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const propose = useMutation({
    mutationFn: (iso: string) => proposeFixtureLiveTime(fixture.id, iso),
    onSuccess: () => {
      setProposedAt('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  if (liveQuery.isLoading) return <div role="status">Загрузка live-игры…</div>;
  if (liveQuery.isError || live === null) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <button type="button" className="btn btn--ghost" onClick={onBack}>К расписанию</button>
        <div role="status">Live-данные игры пока недоступны.</div>
      </div>
    );
  }

  const canRespond =
    live.proposal?.state === 'pending' && live.proposal.proposedByUserId !== meId;
  const submitProposal = () => {
    const date = new Date(proposedAt);
    if (!Number.isFinite(date.getTime())) return;
    propose.mutate(date.toISOString());
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <button type="button" className="btn btn--ghost" onClick={onBack}>К расписанию</button>
      <div className="section-label" style={{ margin: 0 }}>{connectionLabel(socketStatus)}</div>
      <div style={{ textAlign: 'center', color: 'var(--ink)' }}>
        <div style={{ fontSize: 14, fontWeight: 750 }}>{formatDate(live.scheduledStartsAt)}</div>
        <div style={{ fontSize: 34, fontWeight: 950, marginTop: 4 }}>
          {live.score.home} : {live.score.away}
        </div>
      </div>
      {live.overlapWarnings.length > 0 && (
        <div
          role="alert"
          style={{
            padding: 12,
            borderRadius: 16,
            background: 'rgba(196, 122, 30, .14)',
            color: 'var(--ink)',
          }}
        >
          <div style={{ fontWeight: 850 }}>Время пересекается с другой игрой</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontWeight: 700 }}>
            Это предупреждение: вы всё равно можете договориться о времени.
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {live.overlapWarnings.map((warning) => (
              <li key={warning.fixtureId}>
                {warning.tournamentTitle}: {overlapTime(warning)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {live.participants.map((participant) => (
          <div key={participant.userId} style={{ padding: 10, borderRadius: 14, background: 'rgba(255,255,255,.55)' }}>
            <div style={{ color: 'var(--ink)', fontWeight: 850 }}>
              {participantName(fixture, participant.userId)}{onlineUserIds.has(participant.userId) ? ' в сети' : ''}
            </div>
            <div style={{ color: 'var(--muted)', fontWeight: 700 }}>
              Период {participant.currentPeriod} · {participant.shotsTaken} бросков
            </div>
          </div>
        ))}
      </div>
      {live.proposal !== null && (
        <div style={{ padding: 12, borderRadius: 16, background: 'rgba(255,255,255,.6)' }}>
          <div style={{ color: 'var(--ink)', fontWeight: 850 }}>
            Предложенное время: {formatDate(live.proposal.proposedAt)}
          </div>
          {canRespond && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn btn--cta"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ proposalId: live.proposal!.id, accept: true })}
              >
                Подтвердить время
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ proposalId: live.proposal!.id, accept: false })}
              >
                Отклонить
              </button>
            </div>
          )}
        </div>
      )}
      <label style={{ display: 'grid', gap: 6, color: 'var(--ink)', fontWeight: 800 }}>
        Предложить другое время
        <input
          type="datetime-local"
          value={proposedAt}
          min={localDateTimeInputValue(live.scheduledStartsAt)}
          max={localDateTimeInputValue(live.windowEndsAt)}
          onChange={(event) => setProposedAt(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={proposedAt === '' || propose.isPending}
        onClick={submitProposal}
      >
        Отправить предложение
      </button>
      {live.duelMatchId !== null && (
        <button type="button" className="btn btn--cta" onClick={onPlay}>Перейти к игре</button>
      )}
    </div>
  );
}
