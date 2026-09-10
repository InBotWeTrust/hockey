import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import type { OnboardingChainKey } from '../api/onboarding.js';
import { OnboardingFlow } from '../onboarding/OnboardingFlow.js';
import { OnboardingStepEditor } from './OnboardingStepEditor.js';
import { GlassSelect } from '../components/GlassSelect.js';
import {
  createOnboardingStep,
  deleteOnboardingStep,
  duplicateOnboardingStep,
  fetchOnboardingChain,
  fetchOnboardingPreview,
  fetchOnboardingStats,
  patchOnboardingStep,
  publishOnboardingDraft,
  reorderOnboardingSteps,
  resumeOnboardingPreviewTutorial,
  startOnboardingPreviewTutorial,
  submitOnboardingPreviewTutorialShot,
  type AdminOnboardingChain,
  type AdminOnboardingStep,
  type AdminOnboardingStepInput,
  type AdminOnboardingPreview,
  type AdminOnboardingStats,
} from './onboardingApi.js';
import './onboarding-admin.css';

type Section = 'content' | 'preview' | 'statistics';
type PublishIssue = {
  stepId: string;
  field: string;
  code: string;
  message: string;
};

const issueFieldLabels: Record<string, string> = {
  title: 'Заголовок',
  description: 'Описание',
  ctaLabel: 'Текст кнопки',
  mediaObjectId: 'Изображение',
  shooterFrequency: 'Скорость игрока',
  goalieFrequency: 'Скорость вратаря',
  goalFrequency: 'Скорость ворот',
};

function publishIssues(error: unknown): PublishIssue[] {
  if (!(error instanceof ApiError) || error.code !== 'onboarding_publish_invalid') return [];
  const details = error.details;
  if (details === null || typeof details !== 'object' || !('issues' in details)) return [];
  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.filter(
    (issue): issue is PublishIssue =>
      issue !== null &&
      typeof issue === 'object' &&
      typeof (issue as PublishIssue).stepId === 'string' &&
      typeof (issue as PublishIssue).field === 'string' &&
      typeof (issue as PublishIssue).code === 'string' &&
      typeof (issue as PublishIssue).message === 'string',
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие';
}

const integerFormat = new Intl.NumberFormat('ru-RU');
const decimalFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

function durationText(seconds: number | null): string {
  if (seconds === null) return '—';
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes > 0 ? `${minutes} мин ${rest} сек` : `${rest} сек`;
}

function nullableNumber(value: number | null): string {
  return value === null ? '—' : decimalFormat.format(value);
}

function nullablePercent(value: number | null): string {
  return value === null ? '—' : `${decimalFormat.format(value)}%`;
}

export function OnboardingAdmin(): JSX.Element {
  const [chainKey, setChainKey] = useState<OnboardingChainKey>('beginner');
  const [section, setSection] = useState<Section>('content');
  const [chain, setChain] = useState<AdminOnboardingChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorStep, setEditorStep] = useState<AdminOnboardingStep | null | undefined>();
  const [preview, setPreview] = useState<AdminOnboardingPreview | null>(null);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<PublishIssue[]>([]);
  const [brokenThumbnails, setBrokenThumbnails] = useState(() => new Set<string>());
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [statsFrom, setStatsFrom] = useState('');
  const [statsTo, setStatsTo] = useState('');
  const [statsSnapshot, setStatsSnapshot] = useState<{
    key: string;
    data: AdminOnboardingStats;
  } | null>(null);
  const [statsLoadingKey, setStatsLoadingKey] = useState<string | null>(null);
  const [statsFailure, setStatsFailure] = useState<{ key: string; message: string } | null>(null);
  const [statsRetry, setStatsRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setValidationIssues([]);
    setEditorStep(undefined);
    setPreview(null);
    void fetchOnboardingChain(chainKey)
      .then((next) => {
        if (!active) return;
        setChain(next);
        setSelectedVersionId(next.published?.id ?? next.publishedVersions[0]?.id ?? '');
      })
      .catch((nextError: unknown) => active && setError(errorMessage(nextError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [chainKey]);

  const invalidStatsDates = statsFrom !== '' && statsTo !== '' && statsFrom > statsTo;
  const statsRequestKey =
    section === 'statistics' && selectedVersionId !== '' && !invalidStatsDates
      ? JSON.stringify([chainKey, selectedVersionId, statsFrom, statsTo])
      : null;

  useEffect(() => {
    if (statsRequestKey === null) return;
    let active = true;
    setStatsLoadingKey(statsRequestKey);
    setStatsFailure(null);
    void fetchOnboardingStats({
      chain: chainKey,
      versionId: selectedVersionId,
      ...(statsFrom === '' ? {} : { from: `${statsFrom}T00:00:00.000Z` }),
      ...(statsTo === '' ? {} : { to: `${statsTo}T23:59:59.999Z` }),
    })
      .then((next) => active && setStatsSnapshot({ key: statsRequestKey, data: next }))
      .catch(
        (nextError: unknown) =>
          active && setStatsFailure({ key: statsRequestKey, message: errorMessage(nextError) }),
      )
      .finally(() => active && setStatsLoadingKey(null));
    return () => {
      active = false;
    };
  }, [chainKey, selectedVersionId, statsFrom, statsRequestKey, statsRetry, statsTo]);

  const displayedStats =
    statsRequestKey !== null && statsSnapshot?.key === statsRequestKey ? statsSnapshot.data : null;
  const displayedStatsError = invalidStatsDates
    ? 'Дата начала не может быть позже даты окончания'
    : statsRequestKey !== null && statsFailure?.key === statsRequestKey
      ? statsFailure.message
      : null;
  const displayedStatsLoading =
    statsRequestKey !== null &&
    displayedStats === null &&
    displayedStatsError === null &&
    (statsLoadingKey === statsRequestKey || statsSnapshot?.key !== statsRequestKey);

  const editableSteps = chain?.draft?.steps ?? chain?.published?.steps ?? [];
  const tutorialExists = editableSteps.some((step) => step.kind === 'tutorial_shot');
  const published = Boolean(chain?.published);
  const hasDraft = Boolean(chain?.draft);

  const previewRequired = useMemo(
    () =>
      preview ? { chain: preview.chain, versionId: preview.versionId, steps: preview.steps } : null,
    [preview],
  );

  async function apply(operation: () => Promise<AdminOnboardingChain>): Promise<void> {
    setError(null);
    setValidationIssues([]);
    try {
      setChain(await operation());
    } catch (nextError) {
      setError(errorMessage(nextError));
      setValidationIssues(publishIssues(nextError));
      throw nextError;
    }
  }

  async function reorder(stepIds: string[]): Promise<void> {
    await apply(() => reorderOnboardingSteps(chainKey, stepIds));
  }

  function move(stepId: string, direction: -1 | 1): void {
    const index = editableSteps.findIndex((step) => step.id === stepId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= editableSteps.length) return;
    const ids = editableSteps.map((step) => step.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void reorder(ids).catch(() => undefined);
  }

  async function loadPreview(): Promise<void> {
    setSection('preview');
    setError(null);
    try {
      setPreview(await fetchOnboardingPreview(chainKey));
    } catch (nextError) {
      setError(errorMessage(nextError));
    }
  }

  return (
    <section style={{ display: 'grid', gap: 12 }} aria-label="Управление онбордингом">
      <div className="section-label" style={{ marginLeft: -14 }}>
        Онбординг
      </div>
      <div className="glass" style={{ padding: 6, borderRadius: 18, display: 'flex', gap: 6 }}>
        {(
          [
            ['beginner', 'Новичок'],
            ['amateur', 'Любитель'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={chainKey === key ? 'chip chip--active' : 'chip'}
            type="button"
            onClick={() => {
              if (key === chainKey) return;
              setChain(null);
              setSelectedVersionId('');
              setChainKey(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className={section === 'content' ? 'chip chip--active' : 'chip'}
          type="button"
          onClick={() => setSection('content')}
        >
          Контент
        </button>
        <button
          className={section === 'preview' ? 'chip chip--active' : 'chip'}
          type="button"
          onClick={() => void loadPreview()}
        >
          Предпросмотр
        </button>
        <button
          className={section === 'statistics' ? 'chip chip--active' : 'chip'}
          type="button"
          onClick={() => setSection('statistics')}
        >
          Статистика
        </button>
      </div>
      {error && (
        <div className="glass" role="alert" style={{ padding: 12, color: '#9f1239' }}>
          {error}
        </div>
      )}
      {loading && <div role="status">Загружаем онбординг…</div>}

      {!loading && section === 'content' && (
        <>
          <div
            className="glass"
            style={{
              borderRadius: 18,
              padding: 12,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <strong>{published ? 'Опубликовано' : 'Не опубликовано'}</strong>
            <span>{hasDraft ? 'Есть черновик' : 'Черновика нет'}</span>
            <span style={{ marginLeft: 'auto' }}>
              {chain?.enforcementEnabled ? 'Показ включён' : 'Показ выключен'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" type="button" onClick={() => setEditorStep(null)}>
              Добавить шаг
            </button>
            <button
              className="btn btn--cta"
              type="button"
              disabled={!hasDraft}
              onClick={() =>
                void apply(() => publishOnboardingDraft(chainKey)).catch(() => undefined)
              }
            >
              Опубликовать
            </button>
          </div>
          {editorStep !== undefined && (
            <OnboardingStepEditor
              key={editorStep?.id ?? 'new'}
              chainKey={chainKey}
              step={editorStep}
              tutorialAllowed={chainKey === 'beginner' && !tutorialExists}
              onCancel={() => setEditorStep(undefined)}
              onSave={async (input: AdminOnboardingStepInput) => {
                await apply(() =>
                  editorStep
                    ? patchOnboardingStep(chainKey, editorStep.id, input)
                    : createOnboardingStep(chainKey, input),
                );
                setEditorStep(undefined);
              }}
            />
          )}
          <div role="list" aria-label="Шаги онбординга" style={{ display: 'grid', gap: 8 }}>
            {editableSteps.map((step, index) => (
              <article
                role="listitem"
                key={step.id}
                draggable
                onDragStart={() => setDraggedStepId(step.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedStepId || draggedStepId === step.id) return;
                  const ids = editableSteps.map((item) => item.id);
                  const from = ids.indexOf(draggedStepId);
                  const to = ids.indexOf(step.id);
                  ids.splice(to, 0, ids.splice(from, 1)[0]!);
                  setDraggedStepId(null);
                  void reorder(ids).catch(() => undefined);
                }}
                className="glass onboarding-admin__step"
                style={{
                  borderRadius: 18,
                  padding: 12,
                  display: 'grid',
                  gap: 10,
                }}
              >
                {step.kind === 'informational' &&
                  (brokenThumbnails.has(step.id) ? (
                    <div
                      className="onboarding-admin__thumbnail-fallback"
                      role="img"
                      aria-label="Изображение шага недоступно"
                    >
                      Нет изображения
                    </div>
                  ) : (
                    <img
                      className="onboarding-admin__thumbnail"
                      src={step.imageUrl}
                      alt={step.title}
                      onError={() =>
                        setBrokenThumbnails((current) => new Set(current).add(step.id))
                      }
                    />
                  ))}
                <div className="onboarding-admin__step-copy">
                  <small>
                    Шаг {step.position} ·{' '}
                    {step.kind === 'tutorial_shot' ? 'Учебный бросок' : 'Информация'}
                  </small>
                  <h3 style={{ margin: '4px 0' }}>{step.title}</h3>
                  <p style={{ margin: 0, color: 'var(--muted)' }}>{step.description}</p>
                  {validationIssues
                    .filter((issue) => issue.stepId === step.id)
                    .map((issue) => (
                      <div
                        key={`${issue.field}:${issue.code}`}
                        className="onboarding-admin__field-error"
                        data-field={issue.field}
                      >
                        {issueFieldLabels[issue.field] ?? issue.field}: {issue.message}
                      </div>
                    ))}
                </div>
                <div
                  className="onboarding-admin__step-actions"
                  style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}
                >
                  <button
                    className="icon-btn"
                    type="button"
                    disabled={index === 0}
                    aria-label={`Переместить вверх: ${step.title}`}
                    onClick={() => move(step.id, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    disabled={index === editableSteps.length - 1}
                    aria-label={`Переместить вниз: ${step.title}`}
                    onClick={() => move(step.id, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Редактировать: ${step.title}`}
                    onClick={() => setEditorStep(step)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Дублировать: ${step.title}`}
                    onClick={() =>
                      void apply(() => duplicateOnboardingStep(chainKey, step.id)).catch(
                        () => undefined,
                      )
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Удалить: ${step.title}`}
                    onClick={() =>
                      void apply(() => deleteOnboardingStep(chainKey, step.id)).catch(
                        () => undefined,
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {!loading && section === 'preview' && previewRequired && (
        <div style={{ position: 'relative', minHeight: 640, overflow: 'hidden', borderRadius: 24 }}>
          <div
            role="status"
            style={{ position: 'absolute', zIndex: 3, top: 10, left: 10 }}
            className="chip chip--active"
          >
            Предпросмотр
          </div>
          <OnboardingFlow
            mode="preview"
            runId="preview-pending"
            required={previewRequired}
            onCompleted={() => setSection('content')}
            tutorialApi={{
              start: (runId) =>
                runId === 'preview-pending'
                  ? startOnboardingPreviewTutorial(chainKey)
                  : resumeOnboardingPreviewTutorial(runId),
              submit: submitOnboardingPreviewTutorialShot,
            }}
          />
        </div>
      )}
      {!loading && section === 'preview' && !previewRequired && !error && (
        <div role="status">Предпросмотр пока недоступен</div>
      )}
      {!loading && section === 'statistics' && (
        <OnboardingStatistics
          chain={chain}
          selectedVersionId={selectedVersionId}
          onVersionChange={setSelectedVersionId}
          from={statsFrom}
          to={statsTo}
          onFromChange={setStatsFrom}
          onToChange={setStatsTo}
          stats={displayedStats}
          loading={displayedStatsLoading}
          error={displayedStatsError}
          onRetry={() => setStatsRetry((value) => value + 1)}
        />
      )}
    </section>
  );
}

function OnboardingStatistics({
  chain,
  selectedVersionId,
  onVersionChange,
  from,
  to,
  onFromChange,
  onToChange,
  stats,
  loading,
  error,
  onRetry,
}: {
  chain: AdminOnboardingChain | null;
  selectedVersionId: string;
  onVersionChange: (value: string) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  stats: AdminOnboardingStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}): JSX.Element {
  const versions = chain?.publishedVersions ?? [];
  const selected = versions.find((version) => version.id === selectedVersionId);
  const cards = stats
    ? [
        ['Уникальные старты', integerFormat.format(stats.startedUsers)],
        ['Завершения', integerFormat.format(stats.completedUsers)],
        ['Конверсия', `${decimalFormat.format(stats.completionRate)}%`],
        ['Среднее время', durationText(stats.averageCompletionSeconds)],
        ['Повторные старты', integerFormat.format(stats.repeatStarts)],
        ['Среднее попыток', nullableNumber(stats.tutorial.averageAttemptsToGoal)],
        ['Гол с первой попытки', nullablePercent(stats.tutorial.firstAttemptGoalRate)],
        ['Максимум попыток', nullableNumber(stats.tutorial.maxAttempts)],
      ]
    : [];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="glass" style={{ borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Статистика онбординга</h3>
        {versions.length === 0 ? (
          <div role="status">Нет опубликованных версий</div>
        ) : (
          <>
            <GlassSelect
              value={selectedVersionId}
              options={versions.map((version) => ({
                value: version.id,
                label: `Версия ${version.versionNumber} · ${new Date(version.publishedAt).toLocaleDateString('ru-RU')}`,
              }))}
              onChange={onVersionChange}
              ariaLabel="Опубликованная версия"
            />
            {selected && <strong>Выбрана версия {selected.versionNumber}</strong>}
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <label>
            Дата начала
            <input
              type="date"
              aria-label="Дата начала"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
            />
          </label>
          <label>
            Дата окончания
            <input
              type="date"
              aria-label="Дата окончания"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
            />
          </label>
        </div>
        {loading && <div role="status">Загружаем статистику…</div>}
        {error && (
          <div role="alert">
            {error}
            <button className="btn btn--ghost" type="button" onClick={onRetry}>
              Повторить загрузку статистики
            </button>
          </div>
        )}
      </div>
      {!loading && !error && stats && (
        <>
          {stats.startedUsers === 0 && (
            <div className="glass" role="status" style={{ borderRadius: 16, padding: 12 }}>
              За выбранный период запусков нет
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8,
            }}
          >
            {cards.map(([label, value]) => (
              <div className="glass" style={{ borderRadius: 16, padding: 12 }} key={label}>
                <small>{label}</small>
                <strong style={{ display: 'block', marginTop: 5 }}>{value}</strong>
              </div>
            ))}
          </div>
          <div className="glass" style={{ borderRadius: 18, padding: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>Шаг</th>
                  <th>Дошли</th>
                  <th>Отвал</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.steps]
                  .sort((a, b) => a.position - b.position)
                  .map((step) => (
                    <tr key={step.stepId}>
                      <td>
                        {step.position}. {step.title}
                      </td>
                      <td>{integerFormat.format(step.reachedUsers)}</td>
                      <td>{integerFormat.format(step.dropOffUsers)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
              Отвал учитывается через 30 минут после последнего действия
            </p>
          </div>
        </>
      )}
    </div>
  );
}
