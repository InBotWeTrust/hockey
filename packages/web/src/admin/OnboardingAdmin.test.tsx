import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingAdmin } from './OnboardingAdmin.js';
import {
  createOnboardingStep,
  deleteOnboardingStep,
  duplicateOnboardingStep,
  patchOnboardingStep,
  publishOnboardingDraft,
  reorderOnboardingSteps,
  startOnboardingPreviewTutorial,
  resumeOnboardingPreviewTutorial,
  submitOnboardingPreviewTutorialShot,
  uploadOnboardingImage,
} from './onboardingApi.js';

const chain = {
  chainKey: 'beginner' as const,
  enforcementEnabled: true,
  published: {
    id: 'published',
    status: 'published' as const,
    createdAt: '2026-09-01T00:00:00.000Z',
    publishedAt: '2026-09-01T01:00:00.000Z',
    steps: [],
  },
  publishedVersions: [
    { id: 'published', versionNumber: 2, publishedAt: '2026-09-01T01:00:00.000Z' },
    { id: 'published-old', versionNumber: 1, publishedAt: '2026-08-01T01:00:00.000Z' },
  ],
  draft: {
    id: 'draft',
    status: 'draft' as const,
    createdAt: '2026-09-02T00:00:00.000Z',
    publishedAt: null,
    steps: [
      {
        id: 'step-1',
        position: 1,
        kind: 'informational' as const,
        title: 'Всё начинается здесь',
        description: 'История игрока',
        ctaLabel: 'Далее',
        mediaObjectId: 'media-1',
        imageUrl: '/media/1',
      },
      {
        id: 'step-2',
        position: 2,
        kind: 'tutorial_shot' as const,
        title: 'Забей первую шайбу',
        description: 'Учебный бросок',
        ctaLabel: 'Далее',
        tutorial: { shooterFrequency: 0.2, goalieFrequency: 0.2, goalFrequency: 0.2 },
      },
    ],
  },
};
const adminCss = readFileSync(resolve(process.cwd(), 'src/admin/onboarding-admin.css'), 'utf8');

function renderAdmin(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OnboardingAdmin />
    </QueryClientProvider>,
  );
}

describe('onboardingApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the exact create and reorder contracts and returns authoritative chains', async () => {
    const authoritative = { ...chain, draft: { ...chain.draft!, id: 'server-draft' } };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ chain: authoritative }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ chain: authoritative }), { status: 200 }),
      );

    await expect(
      createOnboardingStep('beginner', {
        kind: 'informational',
        title: 'Новый шаг',
        description: 'Текст',
        ctaLabel: 'Далее',
        mediaObjectId: 'media-1',
      }),
    ).resolves.toEqual(authoritative);
    await expect(reorderOnboardingSteps('beginner', ['step-2', 'step-1'])).resolves.toEqual(
      authoritative,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/admin/onboarding/chains/beginner/steps'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/admin/onboarding/chains/beginner/reorder'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ stepIds: ['step-2', 'step-1'] }),
      }),
    );
  });

  it('rejects empty and non-WebP uploads before a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      uploadOnboardingImage(new File([], 'empty.webp', { type: 'image/webp' })),
    ).rejects.toThrow('Файл пустой');
    await expect(
      uploadOnboardingImage(new File(['x'], 'image.png', { type: 'image/png' })),
    ).rejects.toThrow('Только WebP');
    await expect(
      uploadOnboardingImage(new File(['x'], 'renamed.webp', { type: 'image/png' })),
    ).rejects.toThrow('Только WebP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resumes the same preview tutorial run through its dedicated endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          seed: 'seed',
          shotIndex: 2,
          goalieId: 'rookie',
          gameCoreVersion: 1,
          speeds: { shooterFrequency: 0.2, goalieFrequency: 0.2, goalFrequency: 0.2 },
          goalConfirmed: false,
        }),
      ),
    );
    await resumeOnboardingPreviewTutorial('preview-run');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/onboarding/preview/runs/preview-run/tutorial/resume'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses exact edit, duplicate, delete, publish, upload and preview tutorial contracts', async () => {
    const tutorialSession = {
      runId: 'preview-run',
      seed: 'seed',
      shotIndex: 1,
      goalieId: 'rookie',
      gameCoreVersion: 1,
      speeds: { shooterFrequency: 0.2, goalieFrequency: 0.2, goalFrequency: 0.2 },
      goalConfirmed: false,
    } as const;
    const shotResult = { serverResult: 'save' as const, nextShotIndex: 2, goalConfirmed: false };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ chain })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chain }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chain })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chain })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ media: { id: 'media-2' } }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(tutorialSession), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(shotResult)));
    const input = {
      kind: 'informational' as const,
      title: 'Изменённый шаг',
      description: 'Текст',
      ctaLabel: 'Далее',
      mediaObjectId: 'media-1',
    };

    await patchOnboardingStep('beginner', 'step-1', input);
    await duplicateOnboardingStep('beginner', 'step-1');
    await deleteOnboardingStep('beginner', 'step-1');
    await publishOnboardingDraft('beginner');
    await uploadOnboardingImage(new File(['webp'], 'scene.webp', { type: 'image/webp' }));
    await startOnboardingPreviewTutorial('beginner');
    await submitOnboardingPreviewTutorialShot('preview-run', {
      shotIndex: 1,
      input: { tapTime: 10, shooterTapTime: 10 },
      claimedResult: 'save',
    });

    expect(fetchMock.mock.calls.map(([request]) => String(request))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/steps/step-1'),
        expect.stringContaining('/steps/step-1/duplicate'),
        expect.stringContaining('/publish'),
        expect.stringContaining('/admin/onboarding/media'),
        expect.stringContaining('/preview/tutorial/start'),
        expect.stringContaining('/preview/runs/preview-run/tutorial/shot'),
      ]),
    );
    const uploadCall = fetchMock.mock.calls[4]!;
    expect(String(uploadCall[0])).toContain('/admin/onboarding/media');
    expect(uploadCall[1]?.method).toBe('POST');
    const headers = new Headers(uploadCall[1]?.headers);
    expect(headers.get('content-type')).toBe('image/webp');
    expect(headers.get('x-file-name')).toBe('scene.webp');
  });
});

describe('OnboardingAdmin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stacks tutorial speed controls at the mobile breakpoint', () => {
    expect(adminCss).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*\.onboarding-step-editor__speeds\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
  });

  it('loads one selected published version with independent date bounds and renders all metrics', async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      if (url.includes('/admin/onboarding/stats')) {
        return new Response(
          JSON.stringify({
            startedUsers: 12,
            completedUsers: 9,
            completionRate: 75,
            averageCompletionSeconds: 125,
            repeatStarts: 3,
            tutorial: {
              averageAttemptsToGoal: null,
              firstAttemptGoalRate: null,
              maxAttempts: null,
            },
            steps: [
              { stepId: 's2', position: 2, title: 'Второй', reachedUsers: 10, dropOffUsers: 2 },
              { stepId: 's1', position: 1, title: 'Первый', reachedUsers: 12, dropOffUsers: 1 },
            ],
          }),
        );
      }
      throw new Error(`Unexpected request ${url}`);
    });
    renderAdmin();
    await screen.findByText('Всё начинается здесь');
    fireEvent.click(screen.getByRole('button', { name: 'Статистика' }));

    expect(await screen.findByText('Уникальные старты')).toBeInTheDocument();
    expect(screen.getAllByText('12')).toHaveLength(2);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('2 мин 5 сек')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(
      screen.getByText('Отвал учитывается через 30 минут после последнего действия'),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining('Первый'), expect.stringContaining('Второй')]);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликованная версия' }));
    fireEvent.click(await screen.findByRole('option', { name: /Версия 1/ }));
    fireEvent.change(screen.getByLabelText('Дата начала'), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText('Дата окончания'), { target: { value: '2026-08-12' } });
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.includes('chain=beginner') &&
            url.includes('versionId=published-old') &&
            url.includes('from=2026-08-10T00%3A00%3A00.000Z') &&
            url.includes('to=2026-08-12T23%3A59%3A59.999Z'),
        ),
      ).toBe(true),
    );
    expect(screen.getByText(/Выбрана версия 1/)).toBeInTheDocument();
  });

  it('keeps invalid date filters understandable and retryable after an API failure', async () => {
    let statsAttempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      if (url.includes('/admin/onboarding/stats')) {
        statsAttempts += 1;
        return new Response(
          JSON.stringify({ error: { code: 'failed', message: 'Сбой статистики' } }),
          { status: 500 },
        );
      }
      throw new Error(`Unexpected request ${url}`);
    });
    renderAdmin();
    await screen.findByText('Всё начинается здесь');
    fireEvent.click(screen.getByRole('button', { name: 'Статистика' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить запрос');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку статистики' }));
    await waitFor(() => expect(statsAttempts).toBe(2));
    fireEvent.change(screen.getByLabelText('Дата начала'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Дата окончания'), { target: { value: '2026-09-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Дата начала не может быть позже даты окончания',
    );
  });

  it('shows an explicit empty state for a selected version without natural starts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      if (url.includes('/admin/onboarding/stats')) {
        return new Response(
          JSON.stringify({
            startedUsers: 0,
            completedUsers: 0,
            completionRate: 0,
            averageCompletionSeconds: null,
            repeatStarts: 0,
            tutorial: {
              averageAttemptsToGoal: null,
              firstAttemptGoalRate: null,
              maxAttempts: null,
            },
            steps: [],
          }),
        );
      }
      throw new Error(`Unexpected request ${url}`);
    });
    renderAdmin();
    await screen.findByText('Всё начинается здесь');
    fireEvent.click(screen.getByRole('button', { name: 'Статистика' }));
    expect(await screen.findByText('За выбранный период запусков нет')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3);
  });

  it('shows fixed chains, statuses, CRUD and accessible reorder controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      if (url.includes('/duplicate') || init?.method === 'DELETE' || url.endsWith('/reorder')) {
        return new Response(JSON.stringify({ chain }));
      }
      throw new Error(`Unexpected request ${url}`);
    });
    renderAdmin();

    expect(await screen.findByText('Всё начинается здесь')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новичок' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Любитель' })).toBeInTheDocument();
    expect(screen.getByText('Опубликовано')).toBeInTheDocument();
    expect(screen.getByText('Есть черновик')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить шаг' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Редактировать.*Всё начинается здесь/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Дублировать.*Всё начинается здесь/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Удалить.*Всё начинается здесь/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Переместить вниз.*Всё начинается здесь/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Переместить вниз.*Всё начинается здесь/ }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/reorder'),
        expect.objectContaining({ body: JSON.stringify({ stepIds: ['step-2', 'step-1'] }) }),
      ),
    );

    const rows = screen.getAllByRole('listitem');
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!);
    fireEvent.drop(rows[1]!);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
  });

  it('does not offer tutorial steps to Amateur', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const key = String(input).endsWith('/amateur') ? 'amateur' : 'beginner';
      return new Response(
        JSON.stringify({
          chain: { chainKey: key, enforcementEnabled: false, published: null, draft: null },
        }),
      );
    });
    renderAdmin();
    await screen.findByText('Не опубликовано');
    fireEvent.click(screen.getByRole('button', { name: 'Любитель' }));
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chains/amateur'),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Добавить шаг' }));
    fireEvent.click(screen.getByRole('button', { name: 'Тип шага' }));
    expect(screen.queryByRole('option', { name: 'Учебный бросок' })).not.toBeInTheDocument();
  });

  it('offers tutorial speeds only where allowed and keeps server errors visible', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      if (url.endsWith('/publish')) {
        return new Response(
          JSON.stringify({
            error: { code: 'onboarding_publish_invalid', message: 'Добавьте изображение' },
          }),
          { status: 409 },
        );
      }
      throw new Error(`Unexpected request ${url}`);
    });
    renderAdmin();
    await screen.findByText('Опубликовано');
    fireEvent.click(screen.getByRole('button', { name: /Редактировать.*Забей первую шайбу/ }));
    expect(screen.getByLabelText('Скорость игрока')).toHaveValue(0.2);
    expect(screen.getByLabelText('Скорость вратаря')).toHaveValue(0.2);
    expect(screen.getByLabelText('Скорость ворот')).toHaveValue(0.2);

    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('проверьте шаги и изображения');
  });

  it('associates structured publish issues with each exact step and field', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      return new Response(
        JSON.stringify({
          error: {
            code: 'onboarding_publish_invalid',
            message: 'Исправьте ошибки шагов',
            details: {
              issues: [
                {
                  stepId: 'step-1',
                  field: 'mediaObjectId',
                  code: 'media_unavailable',
                  message: 'Изображение недоступно',
                },
                {
                  stepId: 'step-2',
                  field: 'goalieFrequency',
                  code: 'invalid_speed',
                  message: 'Скорость вратаря вне диапазона',
                },
              ],
            },
          },
        }),
        { status: 422 },
      );
    });
    renderAdmin();
    await screen.findByText('Всё начинается здесь');
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    const firstRow = screen.getByText('Всё начинается здесь').closest('[role="listitem"]')!;
    const tutorialRow = screen.getByText('Забей первую шайбу').closest('[role="listitem"]')!;
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось опубликовать: проверьте шаги и изображения.',
    );
    expect(firstRow).toHaveTextContent('Изображение: Изображение недоступно');
    expect(tutorialRow).toHaveTextContent('Скорость вратаря: Скорость вратаря вне диапазона');
  });

  it('renders protected informational thumbnails and a visible fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ chain })));
    renderAdmin();
    const thumbnail = await screen.findByRole('img', { name: 'Всё начинается здесь' });
    expect(thumbnail).toHaveAttribute('src', '/media/1');
    fireEvent.error(thumbnail);
    expect(screen.getByRole('img', { name: 'Изображение шага недоступно' })).toBeInTheDocument();
  });

  it('replaces the editor state with the authoritative full-chain mutation response', async () => {
    const authoritative = {
      ...chain,
      draft: {
        ...chain.draft!,
        steps: [{ ...chain.draft!.steps[0]!, title: 'Серверная версия шага' }],
      },
    };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ chain })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ chain: authoritative }), { status: 201 }),
      );
    renderAdmin();
    await screen.findByText('Всё начинается здесь');
    fireEvent.click(screen.getByRole('button', { name: /Дублировать.*Всё начинается здесь/ }));
    expect(await screen.findByText('Серверная версия шага')).toBeInTheDocument();
    expect(screen.queryByText('Всё начинается здесь')).not.toBeInTheDocument();
  });

  it('previews through admin endpoints without public lifecycle calls', async () => {
    const preview = {
      preview: true,
      chain: 'beginner',
      versionId: 'draft',
      steps: chain.draft!.steps,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/onboarding/chains/beginner')) {
        return new Response(JSON.stringify({ chain }));
      }
      if (url.endsWith('/admin/onboarding/chains/beginner/preview')) {
        return new Response(JSON.stringify(preview));
      }
      throw new Error(`Unexpected request ${url}`);
    });
    renderAdmin();
    await screen.findByText('Опубликовано');
    fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
    expect(
      await screen.findByText('Предпросмотр', { selector: '[role="status"]' }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        /\/onboarding\/(required|start|runs)/.test(String(input)),
      ),
    ).toBe(false);
  });

  it('loads the statistics section instead of rendering a placeholder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ chain: { ...chain, draft: null } })),
    );
    renderAdmin();
    await screen.findByText('Опубликовано');
    fireEvent.click(screen.getByRole('button', { name: 'Статистика' }));
    expect(screen.queryByText(/появится в следующем этапе/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Опубликованная версия' })).toBeInTheDocument();
  });
});
