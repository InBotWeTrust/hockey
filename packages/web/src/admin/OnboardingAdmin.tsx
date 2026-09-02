import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { ApiError } from '../api/apiFetch.js';
import type { OnboardingChainKey } from '../api/onboarding.js';
import { OnboardingFlow } from '../onboarding/OnboardingFlow.js';
import { OnboardingStepEditor } from './OnboardingStepEditor.js';
import {
  createOnboardingStep,
  deleteOnboardingStep,
  duplicateOnboardingStep,
  fetchOnboardingChain,
  fetchOnboardingPreview,
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setValidationIssues([]);
    setEditorStep(undefined);
    setPreview(null);
    void fetchOnboardingChain(chainKey)
      .then((next) => active && setChain(next))
      .catch((nextError: unknown) => active && setError(errorMessage(nextError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [chainKey]);

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
            onClick={() => setChainKey(key)}
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
        <div className="glass" style={{ borderRadius: 18, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Статистика онбординга</h3>
          <p>Подробная воронка прохождения появится в следующем этапе.</p>
        </div>
      )}
    </section>
  );
}
