import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { X } from 'lucide-react';
import { createAdminTournament, fetchAdminTournaments } from './adminApi.js';

const stages = [
  'Основное',
  'Доступ',
  'Регулярка',
  'Плей-офф',
  'Расписание',
  'Награды',
  'Уведомления',
  'Проверка',
] as const;

const defaultDraft = {
  slug: '',
  title: '',
  description: '',
  regularSource: 'head_to_head' as 'head_to_head' | 'daily_aggregate',
  participantLimit: 16,
  playoffSize: 8,
  entryFeeCoins: 0,
  timezone: 'Europe/Moscow',
  startsAt: '',
};

export function TournamentAdmin(): JSX.Element {
  const client = useQueryClient();
  const tournaments = useQuery({ queryKey: ['admin', 'tournaments'], queryFn: fetchAdminTournaments });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState(defaultDraft);
  const create = useMutation({
    mutationFn: () =>
      createAdminTournament({
        slug: draft.slug,
        title: draft.title,
        description: draft.description,
        startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
        registrationOpensAt: null,
        registrationClosesAt: null,
        rules: {
          config:
            draft.regularSource === 'head_to_head'
              ? {
                  regularSource: 'head_to_head', participantLimit: draft.participantLimit,
                  playoffSize: draft.playoffSize, timezone: draft.timezone, registrationMode: 'open',
                  visibility: 'public', entryFeeCoins: draft.entryFeeCoins, roundRobinCycles: 1,
                  roundsPerDay: 1, firstRoundLocalTime: '19:00', fixtureWindowMs: 3_600_000,
                  roundBreakMs: 900_000, dailyDays: null, dailyMetric: null, bestDays: null,
                }
              : {
                  regularSource: 'daily_aggregate', participantLimit: draft.participantLimit,
                  playoffSize: draft.playoffSize, timezone: draft.timezone, registrationMode: 'open',
                  visibility: 'public', entryFeeCoins: draft.entryFeeCoins, roundRobinCycles: null,
                  roundsPerDay: null, firstRoundLocalTime: null, fixtureWindowMs: null,
                  roundBreakMs: null, dailyDays: 14, dailyMetric: 'goals_sum', bestDays: null,
                },
          eligibility: { minLevel: null, maxLevel: null, minGoals: 0, minExperience: 0, invitedUserIds: [], bannedUserIds: [] },
        },
      }),
    onSuccess: () => {
      setWizardOpen(false);
      setStage(0);
      setDraft(defaultDraft);
      void client.invalidateQueries({ queryKey: ['admin', 'tournaments'] });
    },
  });
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div><div className="section-label" style={{ margin: 0 }}>Турниры</div><h2 style={{ margin: '4px 0 0' }}>Управление сезонами</h2></div>
        <button type="button" className="btn btn--cta" onClick={() => setWizardOpen(true)}>Создать турнир</button>
      </div>
      {tournaments.data?.tournaments.length === 0 && <div className="glass" style={{ borderRadius: 22, padding: 18 }}>Турниров пока нет</div>}
      {tournaments.data?.tournaments.map((tournament) => (
        <article key={tournament.id} className="glass" style={{ borderRadius: 22, padding: 16 }}>
          <div className="section-label" style={{ margin: 0 }}>{tournament.status} · ревизия {tournament.revision}</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 5 }}>{tournament.title}</div>
          <div style={{ color: 'var(--muted)', marginTop: 4 }}>{tournament.participantCount} участников</div>
        </article>
      ))}
      {wizardOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-label="Создание турнира" style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 className="modal-title" style={{ margin: 0 }}>Новый турнир</h2>
              <button type="button" className="icon-btn" aria-label="Закрыть" onClick={() => setWizardOpen(false)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>{stages.map((label, index) => <button key={label} type="button" className={stage === index ? 'chip chip--active' : 'chip'} onClick={() => setStage(index)}>{index + 1}. {label}</button>)}</div>
            <div className="modal-copy" style={{ display: 'grid', gap: 10 }}>
              {stage === 0 && <><label>Название<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Slug<input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></label><label>Описание<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></>}
              {stage === 1 && <div>Режим регистрации, видимость, ограничения, приглашения и запреты сохраняются в опубликованной ревизии.</div>}
              {stage === 2 && <><label>Формат<select value={draft.regularSource} onChange={(event) => setDraft({ ...draft, regularSource: event.target.value as typeof draft.regularSource })}><option value="head_to_head">Каждый с каждым</option><option value="daily_aggregate">Daily aggregate</option></select></label><label>Участников<input type="number" value={draft.participantLimit} onChange={(event) => setDraft({ ...draft, participantLimit: Number(event.target.value) })} /></label></>}
              {stage === 3 && <label>Размер плей-офф<select value={draft.playoffSize} onChange={(event) => setDraft({ ...draft, playoffSize: Number(event.target.value) })}>{[2,4,8,16].map((size) => <option key={size}>{size}</option>)}</select></label>}
              {stage === 4 && <><label>Часовой пояс<input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></label><label>Старт<input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label></>}
              {stage === 5 && <label>Вступительный взнос<input type="number" min="0" value={draft.entryFeeCoins} onChange={(event) => setDraft({ ...draft, entryFeeCoins: Number(event.target.value) })} /></label>}
              {stage === 6 && <div>Напоминания и шаблоны push можно переопределить после создания draft.</div>}
              {stage === 7 && <div>Проверьте параметры. Создание сохраняет draft; публикация выполняется отдельным действием с номером ревизии.</div>}
            </div>
            <div className="modal-actions">
              {stage > 0 && <button type="button" className="btn btn--ghost" onClick={() => setStage(stage - 1)}>Назад</button>}
              {stage < stages.length - 1 ? <button type="button" className="modal-primary btn btn--cta" onClick={() => setStage(stage + 1)}>Далее</button> : <button type="button" className="modal-primary btn btn--cta" disabled={!draft.title || !draft.slug || create.isPending} onClick={() => create.mutate()}>Сохранить draft</button>}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
