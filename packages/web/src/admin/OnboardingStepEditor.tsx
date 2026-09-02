import { useEffect, useState } from 'react';
import type { OnboardingChainKey } from '../api/onboarding.js';
import { GlassSelect, type GlassSelectOption } from '../components/GlassSelect.js';
import {
  uploadOnboardingImage,
  type AdminOnboardingStep,
  type AdminOnboardingStepInput,
} from './onboardingApi.js';

const kindOptions: Array<GlassSelectOption<'informational' | 'tutorial_shot'>> = [
  { value: 'informational', label: 'Информационный' },
  { value: 'tutorial_shot', label: 'Учебный бросок' },
];

export function OnboardingStepEditor({
  chainKey,
  step,
  tutorialAllowed,
  onSave,
  onCancel,
}: {
  chainKey: OnboardingChainKey;
  step: AdminOnboardingStep | null;
  tutorialAllowed: boolean;
  onSave: (input: AdminOnboardingStepInput) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const initialKind = step?.kind ?? 'informational';
  const [kind, setKind] = useState<'informational' | 'tutorial_shot'>(initialKind);
  const [title, setTitle] = useState(step?.title ?? '');
  const [description, setDescription] = useState(step?.description ?? '');
  const [ctaLabel, setCtaLabel] = useState(step?.ctaLabel ?? 'Далее');
  const [mediaObjectId, setMediaObjectId] = useState(
    step?.kind === 'informational' ? step.mediaObjectId : '',
  );
  const [imageUrl, setImageUrl] = useState(step?.kind === 'informational' ? step.imageUrl : '');
  const [tutorial, setTutorial] = useState(
    step?.kind === 'tutorial_shot'
      ? step.tutorial
      : { shooterFrequency: 0.2, goalieFrequency: 0.2, goalFrequency: 0.2 },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tutorialAllowed && kind === 'tutorial_shot' && step?.kind !== 'tutorial_shot') {
      setKind('informational');
    }
  }, [kind, step?.kind, tutorialAllowed]);

  const availableKinds =
    chainKey === 'beginner' && (tutorialAllowed || step?.kind === 'tutorial_shot')
      ? kindOptions
      : kindOptions.filter((option) => option.value === 'informational');

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'informational') {
        if (!mediaObjectId) throw new Error('Загрузите изображение WebP');
        await onSave({ kind, title, description, ctaLabel, mediaObjectId });
      } else {
        await onSave({ kind, title, description, ctaLabel, tutorial });
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось сохранить шаг');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass" style={{ padding: 14, borderRadius: 20, display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0 }}>{step ? 'Редактирование шага' : 'Новый шаг'}</h3>
      <label>
        Тип шага
        <GlassSelect
          value={kind}
          options={availableKinds}
          onChange={setKind}
          ariaLabel="Тип шага"
        />
      </label>
      <label>
        Заголовок
        <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        Описание
        <textarea
          value={description}
          maxLength={1000}
          rows={5}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label>
        Текст кнопки
        <input
          value={ctaLabel}
          maxLength={40}
          onChange={(event) => setCtaLabel(event.target.value)}
        />
      </label>
      {kind === 'informational' ? (
        <label>
          Изображение WebP (минимум 800×1200, вертикальное 2:3)
          <input
            type="file"
            accept="image/webp,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError(null);
              void uploadOnboardingImage(file)
                .then((media) => {
                  setMediaObjectId(media.id);
                  setImageUrl(media.url);
                })
                .catch((nextError: unknown) =>
                  setError(
                    nextError instanceof Error ? nextError.message : 'Не удалось загрузить файл',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          />
          {imageUrl && <img src={imageUrl} alt="Предпросмотр изображения" style={{ width: 120 }} />}
        </label>
      ) : (
        <div className="onboarding-step-editor__speeds">
          {(
            [
              ['shooterFrequency', 'Скорость игрока'],
              ['goalieFrequency', 'Скорость вратаря'],
              ['goalFrequency', 'Скорость ворот'],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                aria-label={label}
                type="number"
                min="0.05"
                max="2"
                step="0.05"
                value={tutorial[field]}
                onChange={(event) =>
                  setTutorial((current) => ({ ...current, [field]: Number(event.target.value) }))
                }
              />
            </label>
          ))}
        </div>
      )}
      {error && <div role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
        <button
          className="btn btn--cta"
          type="button"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </section>
  );
}
