import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  archiveAdminBonusGame,
  createAdminBonusGame,
  fetchAdminBonusGames,
  patchAdminBonusGame,
  reorderAdminBonusGames,
  uploadAdminBonusGameMedia,
  type AdminBonusGame,
  type AdminBonusGameAccessType,
  type AdminBonusGameInput,
  type AdminBonusGamePatch,
  type AdminBonusGameStatus,
  type AdminBonusGoaliePattern,
  type AdminBonusMediaKind,
  type AdminBonusPeriodRule,
} from './api.js';

const bonusGamesQueryKey = ['admin', 'bonus-games'] as const;

const defaultPeriod: AdminBonusPeriodRule = {
  periodNumber: 1,
  durationMs: 240_000,
  shotsLimit: 30,
  goalFrequency: 0.45,
  goalieFrequency: 0.5,
  shooterFrequency: 0.65,
  puckSpeedPerMs: 1.2,
  goaliePattern: 'linear',
  goalieAmplitude: 1,
  goalAmplitude: 220,
};

interface BonusGameFormState {
  gameId: string | null;
  originalStatus: AdminBonusGameStatus | null;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  status: AdminBonusGameStatus;
  accessType: AdminBonusGameAccessType;
  unlockPriceStars: number;
  targetGoals: number;
  totalPeriods: number;
  breakDurationMs: number;
  periods: AdminBonusPeriodRule[];
  rewardCoins: number;
  rewardStars: number;
  rewardExperience: number;
  goalkeeperReadyUrl: string;
  goalkeeperSaveUrl: string;
  arenaSlug: string;
  arenaTitle: string;
  arenaArtworkUrl: string;
  arenaThumbnailUrl: string;
  arenaStatus: 'active' | 'archived';
  arenaIsSelectable: boolean;
}

interface UploadRequest {
  kind: 'goalkeeper_ready' | 'goalkeeper_save';
  file: File;
  editorIdentity: string | null;
  generation: number;
}

function createEmptyForm(sortOrder: number): BonusGameFormState {
  return {
    gameId: null,
    originalStatus: null,
    slug: '',
    title: '',
    description: '',
    sortOrder,
    status: 'draft',
    accessType: 'free',
    unlockPriceStars: 0,
    targetGoals: 18,
    totalPeriods: 1,
    breakDurationMs: 0,
    periods: [{ ...defaultPeriod }],
    rewardCoins: 0,
    rewardStars: 0,
    rewardExperience: 0,
    goalkeeperReadyUrl: '',
    goalkeeperSaveUrl: '',
    arenaSlug: '',
    arenaTitle: '',
    arenaArtworkUrl: '',
    arenaThumbnailUrl: '',
    arenaStatus: 'active',
    arenaIsSelectable: true,
  };
}

function formFromGame(game: AdminBonusGame): BonusGameFormState {
  return {
    gameId: game.id,
    originalStatus: game.status,
    slug: game.slug,
    title: game.title,
    description: game.description,
    sortOrder: game.sortOrder,
    status: game.status,
    accessType: game.accessType,
    unlockPriceStars: game.unlockPriceStars,
    targetGoals: game.targetGoals,
    totalPeriods: game.totalPeriods,
    breakDurationMs: game.breakDurationMs,
    periods: game.periods.map((period) => ({ ...period })),
    rewardCoins: game.rewardCoins,
    rewardStars: game.rewardStars,
    rewardExperience: game.rewardExperience,
    goalkeeperReadyUrl: game.goalkeeperReadyUrl,
    goalkeeperSaveUrl: game.goalkeeperSaveUrl,
    arenaSlug: game.arena.slug,
    arenaTitle: game.arena.title,
    arenaArtworkUrl: game.arena.artworkUrl,
    arenaThumbnailUrl: game.arena.thumbnailUrl,
    arenaStatus: game.arena.status,
    arenaIsSelectable: game.arena.isSelectable,
  };
}

function formValidationError(form: BonusGameFormState): string | null {
  if (form.slug.trim().length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    return 'Slug должен содержать латинские буквы, цифры и дефисы.';
  }
  if (
    !form.title.trim() ||
    form.title.trim().length > 120 ||
    !form.arenaSlug.trim() ||
    form.arenaSlug.trim().length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.arenaSlug.trim()) ||
    !form.arenaTitle.trim() ||
    form.arenaTitle.trim().length > 120
  ) {
    return 'Заполните название игры и площадки.';
  }
  if (form.description.trim().length > 2_000) return 'Описание слишком длинное.';
  if (!Number.isInteger(form.sortOrder) || form.sortOrder < 1 || form.sortOrder > 10_000) {
    return 'Порядок должен быть целым числом от 1 до 10000.';
  }
  if (!Number.isInteger(form.targetGoals) || form.targetGoals < 1 || form.targetGoals > 1_000_000) {
    return 'Цель по голам должна быть положительным целым числом.';
  }
  if (!Number.isInteger(form.totalPeriods) || form.totalPeriods < 1 || form.totalPeriods > 9) {
    return 'Количество периодов должно быть от 1 до 9.';
  }
  if (form.periods.length !== form.totalPeriods) return 'Заполните правила каждого периода.';
  const validPeriods = form.periods.every(
    (period, index) =>
      period.periodNumber === index + 1 &&
      Number.isInteger(period.durationMs) &&
      period.durationMs >= 1_000 &&
      period.durationMs <= 10_800_000 &&
      Number.isInteger(period.shotsLimit) &&
      period.shotsLimit >= 1 &&
      period.shotsLimit <= 100 &&
      period.goalFrequency >= 0.1 &&
      period.goalFrequency <= 3 &&
      period.goalieFrequency >= 0.1 &&
      period.goalieFrequency <= 3 &&
      period.shooterFrequency >= 0.1 &&
      period.shooterFrequency <= 3 &&
      period.puckSpeedPerMs >= 0.2 &&
      period.puckSpeedPerMs <= 5 &&
      ['linear', 'sine', 'dash'].includes(period.goaliePattern) &&
      period.goalieAmplitude >= 0 &&
      period.goalieAmplitude <= 1 &&
      period.goalAmplitude >= 0 &&
      period.goalAmplitude <= 220,
  );
  if (!validPeriods) return 'Проверьте параметры периодов.';
  if (form.targetGoals > form.periods.reduce((sum, period) => sum + period.shotsLimit, 0)) {
    return 'Цель по голам не может превышать число бросков.';
  }
  if (
    [
      form.breakDurationMs,
      form.unlockPriceStars,
      form.rewardCoins,
      form.rewardStars,
      form.rewardExperience,
    ].some((value) => !Number.isInteger(value) || value < 0 || value > 10_000_000) ||
    form.breakDurationMs > 10_800_000
  ) {
    return 'Цена, перерыв и награды должны быть неотрицательными целыми числами.';
  }
  if (
    [
      form.arenaArtworkUrl,
      form.arenaThumbnailUrl,
      form.goalkeeperReadyUrl,
      form.goalkeeperSaveUrl,
    ].some((value) => value.trim().length > 2_048)
  ) {
    return 'Ссылка на медиа слишком длинная.';
  }
  if (form.status === 'active' && form.accessType === 'paid' && form.unlockPriceStars < 1) {
    return 'Для платной игры укажите цену в звёздах.';
  }
  if (
    form.status === 'active' &&
    (!form.arenaArtworkUrl.trim() ||
      !form.arenaThumbnailUrl.trim() ||
      !form.goalkeeperReadyUrl.trim() ||
      !form.goalkeeperSaveUrl.trim() ||
      form.arenaStatus !== 'active' ||
      !form.arenaIsSelectable)
  ) {
    return 'Для активной игры загрузите все медиа и активируйте площадку.';
  }
  return null;
}

function formToInput(form: BonusGameFormState): AdminBonusGameInput {
  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    description: form.description.trim(),
    sortOrder: form.sortOrder,
    status: form.status,
    accessType: form.accessType,
    unlockPriceStars: form.accessType === 'free' ? 0 : form.unlockPriceStars,
    targetGoals: form.targetGoals,
    totalPeriods: form.totalPeriods,
    breakDurationMs: form.breakDurationMs,
    periods: form.periods,
    rewardCoins: form.rewardCoins,
    rewardStars: form.rewardStars,
    rewardExperience: form.rewardExperience,
    goalkeeperReadyUrl: form.goalkeeperReadyUrl.trim(),
    goalkeeperSaveUrl: form.goalkeeperSaveUrl.trim(),
    arena: {
      slug: form.arenaSlug.trim(),
      title: form.arenaTitle.trim(),
      artworkUrl: form.arenaArtworkUrl.trim(),
      thumbnailUrl: form.arenaThumbnailUrl.trim(),
      status: form.arenaStatus,
      isSelectable: form.arenaIsSelectable,
    },
  };
}

function formToPatch(form: BonusGameFormState): AdminBonusGamePatch {
  const input = formToInput(form);
  if (input.status !== 'archived') return input;
  const patch: AdminBonusGamePatch = { ...input };
  delete patch.status;
  return patch;
}

export function BonusGamesAdmin(): JSX.Element {
  const queryClient = useQueryClient();
  const archivePendingRef = useRef(false);
  const [form, setForm] = useState<BonusGameFormState | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminBonusGame | null>(null);
  const query = useQuery({ queryKey: bonusGamesQueryKey, queryFn: fetchAdminBonusGames });
  const games = query.data?.games ?? [];
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: bonusGamesQueryKey });
  };
  const archiveMutation = useMutation({
    mutationFn: (gameId: string) => archiveAdminBonusGame(gameId),
    onSuccess: () => {
      setArchiveTarget(null);
      refresh();
    },
    onSettled: () => {
      archivePendingRef.current = false;
    },
  });
  const reorderMutation = useMutation({
    mutationFn: (gameIds: string[]) => reorderAdminBonusGames({ gameIds }),
    onSuccess: (data) => queryClient.setQueryData(bonusGamesQueryKey, data),
  });

  function moveActive(gameId: string, direction: -1 | 1): void {
    const activeIds = games.filter((game) => game.status === 'active').map((game) => game.id);
    const index = activeIds.indexOf(gameId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= activeIds.length) return;
    const next = [...activeIds];
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    reorderMutation.mutate(next);
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
      >
        <div className="section-label" style={{ margin: '2px 0 -4px -14px' }}>
          Бонусные игры ({games.length})
        </div>
        <button
          type="button"
          className="chip chip--active"
          onClick={() => setForm(createEmptyForm(Math.max(1, games.length + 1)))}
        >
          Создать
        </button>
      </div>
      {query.isLoading && <AdminState>Загрузка бонусных игр...</AdminState>}
      {query.isError && <AdminState error>{errorMessage(query.error)}</AdminState>}
      {!query.isLoading && !query.isError && games.length === 0 && (
        <AdminState>Бонусных игр пока нет</AdminState>
      )}
      {games.map((game) => (
        <BonusGameCard
          key={game.id}
          game={game}
          reorderPending={reorderMutation.isPending}
          onEdit={() => setForm(formFromGame(game))}
          onArchive={() => setArchiveTarget(game)}
          onMove={moveActive}
        />
      ))}
      {reorderMutation.isError && (
        <AdminState error>{errorMessage(reorderMutation.error)}</AdminState>
      )}
      {form !== null && (
        <BonusGameEditor
          form={form}
          onChange={setForm}
          onMediaUploaded={(gameId, kind, url) => {
            setForm((current) => {
              if (current === null || current.gameId !== gameId) return current;
              return kind === 'goalkeeper_ready'
                ? { ...current, goalkeeperReadyUrl: url }
                : { ...current, goalkeeperSaveUrl: url };
            });
          }}
          onArchiveRequested={(gameId) => {
            const game = games.find((candidate) => candidate.id === gameId);
            if (game === undefined) return;
            setForm(null);
            setArchiveTarget(game);
          }}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
      {archiveTarget !== null && (
        <ArchiveBonusGameModal
          game={archiveTarget}
          pending={archiveMutation.isPending}
          error={archiveMutation.isError ? errorMessage(archiveMutation.error) : null}
          onCancel={() => {
            if (!archivePendingRef.current) setArchiveTarget(null);
          }}
          onConfirm={() => {
            if (archivePendingRef.current) return;
            archivePendingRef.current = true;
            archiveMutation.mutate(archiveTarget.id);
          }}
        />
      )}
    </section>
  );
}

function BonusGameCard({
  game,
  reorderPending,
  onEdit,
  onArchive,
  onMove,
}: {
  game: AdminBonusGame;
  reorderPending: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onMove: (gameId: string, direction: -1 | 1) => void;
}): JSX.Element {
  const previewUrl = game.arena.thumbnailUrl || game.arena.artworkUrl;
  return (
    <article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 12 }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Площадка «${game.arena.title}»`}
            style={{ width: 84, height: 70, borderRadius: 14, objectFit: 'cover' }}
          />
        ) : (
          <div
            aria-label="Медиа площадки не загружено"
            style={{ width: 84, height: 70, borderRadius: 14, background: 'rgba(255,255,255,0.4)' }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>{game.title}</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, lineHeight: 1.35 }}>
            № {game.sortOrder} · {statusLabel(game.status)} · {accessLabel(game)} · цель{' '}
            {game.targetGoals}
          </div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>
            {game.totalPeriods} пер. · ревизия {game.revision}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn--ghost"
          aria-label={`Редактировать ${game.title}`}
          onClick={onEdit}
        >
          Редактировать
        </button>
        {game.status === 'active' && (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={reorderPending}
              onClick={() => onMove(game.id, -1)}
            >
              Выше
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={reorderPending}
              onClick={() => onMove(game.id, 1)}
            >
              Ниже
            </button>
          </>
        )}
        {game.status !== 'archived' && (
          <button
            type="button"
            className="btn btn--ghost"
            aria-label={`Архивировать ${game.title}`}
            onClick={onArchive}
          >
            Архивировать
          </button>
        )}
      </div>
    </article>
  );
}

function BonusGameEditor({
  form,
  onChange,
  onMediaUploaded,
  onArchiveRequested,
  onCancel,
  onSaved,
}: {
  form: BonusGameFormState;
  onChange: (form: BonusGameFormState) => void;
  onMediaUploaded: (
    gameId: string | null,
    kind: 'goalkeeper_ready' | 'goalkeeper_save',
    url: string,
  ) => void;
  onArchiveRequested: (gameId: string) => void;
  onCancel: () => void;
  onSaved: () => void;
}): JSX.Element {
  const validationError = formValidationError(form);
  const savePendingRef = useRef(false);
  const uploadPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const editorIdentityRef = useRef(form.gameId);
  const uploadGenerationRef = useRef<Record<'goalkeeper_ready' | 'goalkeeper_save', number>>({
    goalkeeper_ready: 0,
    goalkeeper_save: 0,
  });
  editorIdentityRef.current = form.gameId;
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const mutation = useMutation({
    mutationFn: (snapshot: BonusGameFormState) => {
      const input = formToInput(snapshot);
      return snapshot.gameId === null
        ? createAdminBonusGame(input)
        : patchAdminBonusGame(snapshot.gameId, formToPatch(snapshot));
    },
    onSuccess: onSaved,
    onSettled: () => {
      savePendingRef.current = false;
    },
  });
  const uploadMutation = useMutation({
    mutationFn: ({ kind, file }: UploadRequest) => uploadAdminBonusGameMedia(kind, file),
    onSuccess: ({ media }, request) => {
      if (
        !mountedRef.current ||
        editorIdentityRef.current !== request.editorIdentity ||
        uploadGenerationRef.current[request.kind] !== request.generation ||
        media.kind !== request.kind
      ) {
        return;
      }
      onMediaUploaded(request.editorIdentity, request.kind, media.url);
    },
    onSettled: () => {
      uploadPendingRef.current = false;
    },
  });

  function setField<K extends keyof BonusGameFormState>(
    key: K,
    value: BonusGameFormState[K],
  ): void {
    onChange({ ...form, [key]: value });
  }

  function setTotalPeriods(value: number): void {
    const count = Math.max(0, Math.min(9, value));
    const periods = Array.from({ length: count }, (_, index) => ({
      ...(form.periods[index] ?? defaultPeriod),
      periodNumber: index + 1,
    }));
    onChange({ ...form, totalPeriods: value, periods });
  }

  function setPeriod(index: number, patch: Partial<AdminBonusPeriodRule>): void {
    onChange({
      ...form,
      periods: form.periods.map((period, periodIndex) =>
        periodIndex === index ? { ...period, ...patch } : period,
      ),
    });
  }

  function requestCancel(): void {
    if (savePendingRef.current || uploadPendingRef.current) return;
    onCancel();
  }

  function requestSave(): void {
    if (savePendingRef.current || uploadPendingRef.current) return;
    if (form.gameId !== null && form.originalStatus !== 'archived' && form.status === 'archived') {
      onArchiveRequested(form.gameId);
      return;
    }
    if (validationError !== null) return;
    savePendingRef.current = true;
    mutation.mutate(form);
  }

  function setMediaValue(kind: 'goalkeeper_ready' | 'goalkeeper_save', value: string): void {
    uploadGenerationRef.current[kind] += 1;
    setField(kind === 'goalkeeper_ready' ? 'goalkeeperReadyUrl' : 'goalkeeperSaveUrl', value);
  }

  function requestUpload(kind: AdminBonusMediaKind, file: File): void {
    if (
      savePendingRef.current ||
      uploadPendingRef.current ||
      (kind !== 'goalkeeper_ready' && kind !== 'goalkeeper_save')
    ) {
      return;
    }
    uploadPendingRef.current = true;
    uploadGenerationRef.current[kind] += 1;
    uploadMutation.mutate({
      kind,
      file,
      editorIdentity: form.gameId,
      generation: uploadGenerationRef.current[kind],
    });
  }

  const title = form.gameId === null ? 'Новая бонусная игра' : 'Редактирование бонусной игры';
  const archiveTransition =
    form.gameId !== null && form.originalStatus !== 'archived' && form.status === 'archived';
  const pending = mutation.isPending || uploadMutation.isPending;
  return (
    <Modal
      title={title}
      copy="Настройки применяются к новым попыткам после сохранения."
      onClose={requestCancel}
      closeBlocked={pending}
      wide
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <Field label="Slug">
          <input value={form.slug} onChange={(event) => setField('slug', event.target.value)} />
        </Field>
        <Field label="Название">
          <input value={form.title} onChange={(event) => setField('title', event.target.value)} />
        </Field>
        <Field label="Описание">
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </Field>
        <Grid>
          <NumberField
            label="Порядок"
            value={form.sortOrder}
            min={1}
            onChange={(value) => setField('sortOrder', value)}
          />
          <Field label="Статус">
            <select
              value={form.status}
              onChange={(event) => setField('status', event.target.value as AdminBonusGameStatus)}
            >
              <option value="draft">Черновик</option>
              <option value="active">Активна</option>
              <option value="archived">В архиве</option>
            </select>
          </Field>
          <Field label="Доступ">
            <select
              value={form.accessType}
              onChange={(event) =>
                setField('accessType', event.target.value as AdminBonusGameAccessType)
              }
            >
              <option value="free">Бесплатная</option>
              <option value="paid">Платная</option>
            </select>
          </Field>
          <NumberField
            label="Цена в звёздах"
            value={form.unlockPriceStars}
            min={0}
            onChange={(value) => setField('unlockPriceStars', value)}
          />
          <NumberField
            label="Цель по голам"
            value={form.targetGoals}
            min={1}
            onChange={(value) => setField('targetGoals', value)}
          />
          <NumberField
            label="Периодов"
            value={form.totalPeriods}
            min={1}
            max={9}
            onChange={setTotalPeriods}
          />
          <NumberField
            label="Перерыв, мс"
            value={form.breakDurationMs}
            min={0}
            onChange={(value) => setField('breakDurationMs', value)}
          />
        </Grid>
        {form.periods.map((period, index) => (
          <PeriodEditor
            key={period.periodNumber}
            period={period}
            onChange={(patch) => setPeriod(index, patch)}
          />
        ))}
        <Grid>
          <NumberField
            label="Награда: монеты"
            value={form.rewardCoins}
            min={0}
            onChange={(value) => setField('rewardCoins', value)}
          />
          <NumberField
            label="Награда: звёзды"
            value={form.rewardStars}
            min={0}
            onChange={(value) => setField('rewardStars', value)}
          />
          <NumberField
            label="Награда: опыт"
            value={form.rewardExperience}
            min={0}
            onChange={(value) => setField('rewardExperience', value)}
          />
        </Grid>
        <Field label="Slug площадки">
          <input
            value={form.arenaSlug}
            onChange={(event) => setField('arenaSlug', event.target.value)}
          />
        </Field>
        <Field label="Название площадки">
          <input
            value={form.arenaTitle}
            onChange={(event) => setField('arenaTitle', event.target.value)}
          />
        </Field>
        <Field label="Фон площадки">
          <input
            value={form.arenaArtworkUrl}
            onChange={(event) => setField('arenaArtworkUrl', event.target.value)}
          />
        </Field>
        <Field label="Миниатюра площадки">
          <input
            value={form.arenaThumbnailUrl}
            onChange={(event) => setField('arenaThumbnailUrl', event.target.value)}
          />
        </Field>
        <Grid>
          <Field label="Статус площадки">
            <select
              value={form.arenaStatus}
              onChange={(event) =>
                setField('arenaStatus', event.target.value as 'active' | 'archived')
              }
            >
              <option value="active">Активна</option>
              <option value="archived">В архиве</option>
            </select>
          </Field>
          <Field label="Можно выбрать домашней">
            <input
              type="checkbox"
              checked={form.arenaIsSelectable}
              onChange={(event) => setField('arenaIsSelectable', event.target.checked)}
            />
          </Field>
        </Grid>
        <MediaField
          label="Вратарь: готов"
          value={form.goalkeeperReadyUrl}
          kind="goalkeeper_ready"
          pending={uploadMutation.isPending}
          onValue={(value) => setMediaValue('goalkeeper_ready', value)}
          onFile={requestUpload}
        />
        <MediaField
          label="Вратарь: сейв"
          value={form.goalkeeperSaveUrl}
          kind="goalkeeper_save"
          pending={uploadMutation.isPending}
          onValue={(value) => setMediaValue('goalkeeper_save', value)}
          onFile={requestUpload}
        />
        {validationError !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            {validationError}
          </div>
        )}
        {mutation.isError && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            {errorMessage(mutation.error)}
          </div>
        )}
        {uploadMutation.isError && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>
            {errorMessage(uploadMutation.error)}
          </div>
        )}
        <div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={requestCancel}
            disabled={pending}
          >
            Отмена
          </button>
          <button
            type="button"
            className="modal-primary btn--cta"
            onClick={requestSave}
            disabled={pending || (!archiveTransition && validationError !== null)}
          >
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PeriodEditor({
  period,
  onChange,
}: {
  period: AdminBonusPeriodRule;
  onChange: (patch: Partial<AdminBonusPeriodRule>) => void;
}): JSX.Element {
  return (
    <section
      className="glass"
      aria-label={`${period.periodNumber}-й период`}
      style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}
    >
      <div style={{ fontSize: 13, fontWeight: 950 }}>{period.periodNumber}-й период</div>
      <Grid>
        <NumberField
          label="Длительность, мс"
          value={period.durationMs}
          min={1000}
          onChange={(value) => onChange({ durationMs: value })}
        />
        <NumberField
          label="Лимит бросков"
          value={period.shotsLimit}
          min={1}
          max={100}
          onChange={(value) => onChange({ shotsLimit: value })}
        />
        <NumberField
          label="Частота ворот"
          value={period.goalFrequency}
          min={0.1}
          max={3}
          step={0.01}
          onChange={(value) => onChange({ goalFrequency: value })}
        />
        <NumberField
          label="Частота вратаря"
          value={period.goalieFrequency}
          min={0.1}
          max={3}
          step={0.01}
          onChange={(value) => onChange({ goalieFrequency: value })}
        />
        <NumberField
          label="Частота игрока"
          value={period.shooterFrequency}
          min={0.1}
          max={3}
          step={0.01}
          onChange={(value) => onChange({ shooterFrequency: value })}
        />
        <NumberField
          label="Скорость шайбы"
          value={period.puckSpeedPerMs}
          min={0.2}
          max={5}
          step={0.01}
          onChange={(value) => onChange({ puckSpeedPerMs: value })}
        />
        <Field label="Паттерн вратаря">
          <select
            value={period.goaliePattern}
            onChange={(event) =>
              onChange({ goaliePattern: event.target.value as AdminBonusGoaliePattern })
            }
          >
            <option value="linear">Линейный</option>
            <option value="sine">Синус</option>
            <option value="dash">Рывок</option>
          </select>
        </Field>
        <NumberField
          label="Амплитуда вратаря"
          value={period.goalieAmplitude}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => onChange({ goalieAmplitude: value })}
        />
        <NumberField
          label="Амплитуда ворот"
          value={period.goalAmplitude}
          min={0}
          max={220}
          step={1}
          onChange={(value) => onChange({ goalAmplitude: value })}
        />
      </Grid>
    </section>
  );
}

function MediaField({
  label,
  value,
  kind,
  pending,
  onValue,
  onFile,
}: {
  label: string;
  value: string;
  kind: AdminBonusMediaKind;
  pending: boolean;
  onValue: (value: string) => void;
  onFile: (kind: AdminBonusMediaKind, file: File) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <Field label={label}>
        <input value={value} onChange={(event) => onValue(event.target.value)} />
      </Field>
      <label style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>
        Загрузить {label}
        <input
          type="file"
          accept="image/webp"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(kind, file);
          }}
        />
      </label>
    </div>
  );
}

function ArchiveBonusGameModal({
  game,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  game: AdminBonusGame;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <Modal
      title="Архивировать бонусную игру"
      copy="Новые попытки станут недоступны. Активные попытки продолжатся по сохранённым снимкам правил."
      onClose={onCancel}
      closeBlocked={pending}
    >
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={pending}>
          Отмена
        </button>
        <button
          type="button"
          className="modal-primary btn--cta"
          onClick={onConfirm}
          disabled={pending}
        >
          Архивировать {game.title}
        </button>
      </div>
      {error !== null && (
        <div role="alert" style={{ marginTop: 10, color: 'var(--red-deep)', fontSize: 12 }}>
          {error}
        </div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  copy,
  onClose,
  closeBlocked = false,
  wide = false,
  children,
}: {
  title: string;
  copy: string;
  onClose: () => void;
  closeBlocked?: boolean;
  wide?: boolean;
  children: ReactNode;
}): JSX.Element {
  const cardRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeBlockedRef = useRef(closeBlocked);
  onCloseRef.current = onClose;
  closeBlockedRef.current = closeBlocked;
  useEffect(() => {
    const card = cardRef.current;
    const first = card?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !closeBlockedRef.current) onCloseRef.current();
      if (event.key !== 'Tab' || !card) return;
      const focusable = Array.from(
        card.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        ),
      );
      const firstFocusable = focusable[0];
      const lastFocusable = focusable.at(-1);
      if (!firstFocusable || !lastFocusable) return;
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
      if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeBlocked) onClose();
      }}
    >
      <section
        ref={cardRef}
        className="modal-card"
        style={
          wide
            ? { width: 'min(720px, calc(100vw - 24px))', maxHeight: '100%', overflowY: 'auto' }
            : undefined
        }
      >
        <h2 className="modal-title">{title}</h2>
        <p className="modal-copy">{copy}</p>
        <div style={{ marginTop: 14 }}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label
      style={{
        display: 'grid',
        gap: 5,
        minWidth: 0,
        color: 'var(--muted)',
        fontSize: 11,
        fontWeight: 850,
      }}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function Grid({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {children}
    </div>
  );
}

function AdminState({
  error = false,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role={error ? 'alert' : undefined}
      style={{
        padding: '10px 2px',
        color: error ? 'var(--red-deep)' : 'var(--muted)',
        fontSize: 13,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

function statusLabel(status: AdminBonusGameStatus): string {
  return status === 'active' ? 'активна' : status === 'draft' ? 'черновик' : 'архив';
}

function accessLabel(game: AdminBonusGame): string {
  return game.accessType === 'free' ? 'бесплатно' : `${game.unlockPriceStars} зв.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие.';
}
