import { BonusRecordsModal, formatBonusRecord } from '../profile/BonusRecordsModal.js';
import {CYBERPUNK_STORY,CyberpunkHints} from '../game/CyberpunkBriefing';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDollarSign,
  Info,
  Star,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import {
  fetchBonusGames,
  fetchBonusRecords,
  abandonBonusAttempt,
  acknowledgeBonusPreview,
  purchaseBonusGame,
  startBonusAttempt,
  type BonusGameCard,
  type BonusSkillCode,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import {
  deriveAmateurAccess,
  guardAmateurMutation,
  wasAmateurLevelRequiredErrorHandled,
} from '../amateur/amateurAccess.js';
import { useAuthStore } from '../auth/authStore.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import {
  enduranceQualificationLines,
  qualificationDescription,
} from '../game/bonusGameQualification.js';
import { catalogBonusGameArtwork, versionBonusGameArtwork } from '../game/bonusGameArtwork.js';
import { bonusGameArtworkUrls, preloadArtwork } from '../app/artworkCache.js';
import { formatRussianCount } from '../lib/russianPlural.js';
import { useBonusGameStore } from '../stores/bonusGameStore.js';
import { useDailyStore } from '../stores/dailyStore.js';

const SAFE_UI_ERROR_MESSAGE = 'Не удалось выполнить запрос. Попробуйте ещё раз.';
const LAST_SKILL_STORAGE_KEY = 'bonus-games:last-skill';

function isUnreleasedChallenge(game: BonusGameCard): boolean {
  return game.skill_code === 'challenge' && game.slug !== 'challenge-beach' &&
    !(import.meta.env.DEV || import.meta.env.VITE_CHALLENGES_ENABLED === true);
}

function formatAttemptResetCountdown(resetsAt: string, nowMs: number): string | null {
  const resetMs = Date.parse(resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  const totalSeconds = Math.max(0, Math.ceil((resetMs - nowMs) / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} д ${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч ${minutes} мин ${seconds} сек`;
  if (minutes > 0) return `${minutes} мин ${seconds} сек`;
  return `${seconds} сек`;
}

const skillLabels: Record<BonusSkillCode, string> = {
  speed: 'Скорость',
  accuracy: 'Точность',
  marksmanship: 'Меткость',
  endurance: 'Выносливость',
  challenge: 'Испытания',
};

function safeUiError(error: unknown): string {
  return error instanceof ApiError ? error.message : SAFE_UI_ERROR_MESSAGE;
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function actionLabel(game: BonusGameCard): string {
  if (game.state === 'in_progress' || game.active_attempt !== null) return 'Продолжить';
  if (game.state === 'completed') return 'Повторить';
  if (game.state === 'available') return 'Играть';
  if (game.state === 'purchase_required') {
    return `Открыть за ${numberText(game.unlock_price_stars)} звезды`;
  }
  return game.state === 'archived' ? 'Недоступна' : 'Закрыта';
}

function isPlayable(game: BonusGameCard): boolean {
  return game.state === 'available' || game.state === 'completed';
}

export function bonusGameVisualStatus(game: BonusGameCard): 'completed' | 'available' | 'locked' {
  if (game.state === 'completed') return 'completed';
  if (game.active_attempt !== null || game.state === 'in_progress' || game.state === 'available') {
    return 'available';
  }
  return 'locked';
}

export function BonusGamesScreen(): JSX.Element {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');
  const [recordsGame, setRecordsGame] = useState<BonusGameCard | null>(null);
  const queryClient = useQueryClient();
  const competitionLevel = useAuthStore((state) => state.user?.competitionLevel ?? null);
  const dailyData = useDailyStore((state) => state.data);
  const refreshDaily = useDailyStore((state) => state.refresh);
  const progressRequestRef = useRef(false);
  useEffect(() => {
    if (competitionLevel !== 'beginner' || dailyData !== null || progressRequestRef.current) {
      return;
    }
    progressRequestRef.current = true;
    void refreshDaily();
  }, [competitionLevel, dailyData, refreshDaily]);
  const amateurAccess = deriveAmateurAccess({
    competitionLevel,
    qualifyingGoals: dailyData?.lifetime_total_goals,
    unlockGoalsRequired: dailyData?.amateur_unlock_goals_required,
  });
  const [switchGame, setSwitchGame] = useState<BonusGameCard | null>(null);
  const [purchaseGame, setPurchaseGame] = useState<BonusGameCard | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3>(1);
  const [previewGame, setPreviewGame] = useState<BonusGameCard | null>(null);
  const previewRecords = useQuery({
    queryKey: ['bonus-records-preview', previewGame?.id, currentUserId],
    queryFn: () => fetchBonusRecords(previewGame!.id),
    enabled: Boolean(previewGame?.is_completed && previewGame.skill_code !== 'challenge'),
  });
  const switchAttemptRequestRef = useRef(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [developmentToast, setDevelopmentToast] = useState(false);
  useEffect(() => {
    if (!developmentToast) return;
    const timer = window.setTimeout(() => setDevelopmentToast(false), 2000);
    return () => window.clearTimeout(timer);
  }, [developmentToast]);
  const [selectedSkill, setSelectedSkill] = useState<BonusSkillCode>(() => {
    const stored = localStorage.getItem(LAST_SKILL_STORAGE_KEY);
    if (competitionLevel === 'beginner' && stored !== 'speed' && stored !== 'accuracy') return 'speed';
    return stored === 'accuracy' || stored === 'marksmanship' || stored === 'endurance' || stored === 'challenge'
      ? stored
      : 'speed';
  });
  const [allowanceNowMs, setAllowanceNowMs] = useState(() => Date.now());
  const refreshedAllowanceResetRef = useRef<string | null>(null);
  const catalogQuery = useQuery({ queryKey: ['bonus-games'], queryFn: fetchBonusGames });
  const startMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const response = await startBonusAttempt(gameId, previewGame?.id === gameId && previewGame.levels?.length ? selectedLevel : undefined);
      if (!response.attempt.preview_required) return response;
      return await acknowledgeBonusPreview(response.attempt.id, false);
    },
    onSuccess: (response) => {
      setPreviewGame(null);
      useBonusGameStore.getState().applyState(response.attempt);
      navigate(
        `/bonus-games/${response.attempt.game_id}/play?attempt=${encodeURIComponent(response.attempt.id)}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['bonus-games'], refetchType: 'none' });
    },
    onError: async (error) => {
      if (!(error instanceof ApiError) || error.code !== 'bonus_previous_level_required') return;
      const refreshed = await catalogQuery.refetch();
      setPreviewGame((current) => current === null ? null : refreshed.data?.games.find((game) => game.id === current.id) ?? current);
    },
  });
  const purchaseMutation = useMutation({
    mutationFn: purchaseBonusGame,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bonus-games'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        refreshDaily(),
      ]);
      setPurchaseGame(null);
    },
  });
  const activeAttempt = catalogQuery.data?.active_attempt ?? null;
  const allGames = catalogQuery.data?.games ?? [];
  const activeGame = allGames.find((game) => game.active_attempt?.id === activeAttempt?.id);
  const continueActiveAttempt = (): void => {
    if (activeAttempt === null || activeGame === undefined) return;
    navigate(`/bonus-games/${activeGame.id}/play?attempt=${encodeURIComponent(activeAttempt.id)}`);
  };

  const performGameAction = (game: BonusGameCard): void => {
    if (game.state === 'level_locked') {
      guardAmateurMutation(amateurAccess, () => undefined);
      return;
    }
    if (game.state === 'purchase_required') {
      purchaseMutation.reset();
      setPurchaseGame(game);
      return;
    }
    if (game.state === 'in_progress' || game.active_attempt !== null) {
      navigate(
        `/bonus-games/${game.id}/play?attempt=${encodeURIComponent(game.active_attempt!.id)}`,
      );
      return;
    }
    if (isPlayable(game)) { setSelectedLevel(1); setPreviewGame(game); }
  };

  const switchAttemptMutation = useMutation({
    mutationFn: async ({ attemptId }: { attemptId: string; game: BonusGameCard }) =>
      await abandonBonusAttempt(attemptId),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['bonus-games'] });
      setSwitchGame(null);
      performGameAction(variables.game);
    },
    onSettled: () => {
      switchAttemptRequestRef.current = false;
    },
  });

  const abandonAndOpenGame = (): void => {
    if (switchAttemptRequestRef.current || activeAttempt === null || switchGame === null) return;
    switchAttemptRequestRef.current = true;
    switchAttemptMutation.mutate({ attemptId: activeAttempt.id, game: switchGame });
  };

  const openGame = (game: BonusGameCard): void => {
    if (isUnreleasedChallenge(game)) { setDevelopmentToast(true); return; }
    if (game.state === 'level_locked') {
      performGameAction(game);
      return;
    }
    if (activeAttempt !== null && game.active_attempt === null) {
      switchAttemptMutation.reset();
      setSwitchGame(game);
      return;
    }
    performGameAction(game);
  };
  const games = allGames.filter((game) => game.skill_code === selectedSkill);
  const selectedAllowance = catalogQuery.data?.attempt_allowances?.[selectedSkill];
  const completedGamesCount = games.filter(
    (game) => game.is_completed || game.state === 'completed',
  ).length;
  const gamesProgressPercent =
    games.length <= 0 ? 0 : Math.min(100, Math.max(0, (completedGamesCount / games.length) * 100));
  const allowanceCountdown =
    selectedAllowance === undefined
      ? null
      : formatAttemptResetCountdown(selectedAllowance.resets_at, allowanceNowMs);
  useEffect(() => {
    if (selectedAllowance === undefined || allowanceCountdown === null) return;
    if (Date.parse(selectedAllowance.resets_at) <= allowanceNowMs) return;
    const interval = window.setInterval(() => setAllowanceNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [selectedAllowance, allowanceCountdown, allowanceNowMs]);
  useEffect(() => {
    if (
      selectedAllowance === undefined ||
      Date.parse(selectedAllowance.resets_at) > allowanceNowMs ||
      refreshedAllowanceResetRef.current === selectedAllowance.resets_at
    ) {
      return;
    }
    refreshedAllowanceResetRef.current = selectedAllowance.resets_at;
    void catalogQuery.refetch();
  }, [allowanceCountdown, catalogQuery, selectedAllowance]);
  const canStartNewAttempt = selectedAllowance === undefined || selectedAllowance.remaining > 0;
  const selectSkill = (skill: BonusSkillCode): void => {
    if (skill !== 'speed' && skill !== 'accuracy' && competitionLevel === 'beginner') { guardAmateurMutation(amateurAccess, () => undefined); return; }
    setSelectedSkill(skill);
    localStorage.setItem(LAST_SKILL_STORAGE_KEY, skill);
  };
  const focusGame =
    games.find((game) => game.active_attempt !== null) ??
    games.find((game) => game.state === 'in_progress') ??
    games.find((game) => game.state === 'available') ??
    null;
  const completedGames = games.filter(
    (game) => game.state === 'completed' && game.id !== focusGame?.id,
  );
  const futureGames = games.filter(
    (game) =>
      game.id !== focusGame?.id &&
      game.state !== 'completed' &&
      game.state !== 'available' &&
      game.state !== 'in_progress',
  );
  useEffect(() => {
    if (allGames.length === 0) return;
    preloadArtwork(bonusGameArtworkUrls(allGames, selectedSkill, focusGame?.id ?? null));
  }, [allGames, focusGame?.id, selectedSkill]);

  return (
    <main
      className="screen"
      style={{
        padding: 'calc(18px + var(--app-safe-top)) 14px 24px',
        overflowY: 'auto',
      }}
    >
      <section className="bonus-games-catalog" aria-labelledby="bonus-games-title">
        <header className="bonus-games-catalog__header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => navigate('/sections')}
            aria-label="Назад"
            title="Назад"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <div className="bonus-games-catalog__heading">
            <h1 id="bonus-games-title" className="bonus-games-catalog__title screen-title-on-arena">
              Бонусные игры
            </h1>
            <button
              type="button"
              className="section-info-btn"
              onClick={() => setRulesOpen(true)}
              aria-label="Правила бонусных игр"
            >
              <Info size={12} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="bonus-games-skill-tabs">
          <SegmentedTabs
            items={(Object.keys(skillLabels) as BonusSkillCode[]).map((skill) => ({
              id: skill,
              label: skillLabels[skill],
            }))}
            activeTab={selectedSkill}
            ariaLabel="Навык"
            onChange={selectSkill}
            scrollable
          />
        </div>

        <section
          className={`bonus-games-attempt-progress${selectedAllowance === undefined ? ' bonus-games-attempt-progress--loading' : ''}`}
          aria-label={`Прогресс игр: ${skillLabels[selectedSkill]}`}
        >
          {selectedAllowance ? (
            <>
              <div
                className="bonus-games-attempt-progress__bar"
                role="progressbar"
                aria-label={`Пройдено игр: ${skillLabels[selectedSkill]}`}
                aria-valuemin={0}
                aria-valuenow={completedGamesCount}
                aria-valuemax={games.length}
              >
                <span style={{ width: `${gamesProgressPercent}%` }} />
                <strong className="bonus-games-attempt-progress__value">
                  {completedGamesCount}/{games.length} игр
                </strong>
              </div>
              <div className="bonus-games-attempt-progress__meta">
                <strong>
                  {selectedAllowance.remaining} из {selectedAllowance.daily_limit} попыток
                </strong>
                {allowanceCountdown !== null ? (
                  <span>До обновления: {allowanceCountdown}</span>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        {catalogQuery.isLoading ? (
          <div className="bonus-games-catalog__notice" role="status">
            Загружаем бонусные игры…
          </div>
        ) : catalogQuery.isError ? (
          <div
            className="bonus-games-catalog__notice bonus-games-catalog__notice--error"
            role="alert"
          >
            {safeUiError(catalogQuery.error)}
          </div>
        ) : catalogQuery.data?.games.length === 0 ? (
          <div className="bonus-games-catalog__notice">Сейчас нет доступных бонусных игр.</div>
        ) : games.length > 0 ? (
          <div className="bonus-games-catalog__groups">
            {focusGame !== null ? (
              <section className="bonus-games-focus" aria-labelledby="bonus-games-current-title">
                <h2 id="bonus-games-current-title" className="section-label sections-group__title">
                  Текущая игра
                </h2>
                <BonusGameCard
                  game={focusGame}
                  actionLabel={actionLabel(focusGame)}
                  isStarting={startMutation.isPending && startMutation.variables === focusGame.id}
                  canStartNewAttempt={canStartNewAttempt}
                  onAction={() => openGame(focusGame)}
                  featured={true}
                />
              </section>
            ) : null}
            {completedGames.length > 0 ? (
              <section className="bonus-games-group" aria-labelledby="bonus-games-completed-title">
                <h2
                  id="bonus-games-completed-title"
                  className="section-label sections-group__title"
                >
                  Пройденные · {completedGames.length}
                </h2>
                <div className="bonus-games-catalog__grid">
                  {completedGames.map((game) => (
                    <BonusGameCard
                      key={game.id}
                      game={game}
                      actionLabel={actionLabel(game)}
                      isStarting={startMutation.isPending && startMutation.variables === game.id}
                      canStartNewAttempt={canStartNewAttempt}
                      onAction={() => openGame(game)}
                      compact={true}
                    />
                  ))}
                </div>
              </section>
            ) : null}
            {futureGames.length > 0 ? (
              <section className="bonus-games-group" aria-labelledby="bonus-games-next-title">
                <h2 id="bonus-games-next-title" className="section-label sections-group__title">
                  Дальше
                </h2>
                <div className="bonus-games-catalog__grid bonus-games-catalog__grid--compact">
                  {futureGames.map((game) => (
                    <BonusGameCard
                      key={game.id}
                      game={game}
                      actionLabel={actionLabel(game)}
                      isStarting={false}
                      canStartNewAttempt={canStartNewAttempt}
                      onAction={() => openGame(game)}
                      compact={true}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {startMutation.isError && !wasAmateurLevelRequiredErrorHandled(startMutation.error) && (
          <div className="bonus-games-catalog__notice" role="alert">
            {safeUiError(startMutation.error)}
          </div>
        )}
      </section>
      {developmentToast && <div role="status" style={{ position: 'fixed', bottom: 'calc(100px + var(--app-safe-bottom))',
        left: '50%', transform: 'translateX(-50%)', padding: '12px 18px', borderRadius: 16,
        background: '#0f172a', color: '#fff', zIndex: 1000, whiteSpace: 'nowrap' }}>Локация в разработке</div>}
      {rulesOpen && <BonusGamesRulesModal onClose={() => setRulesOpen(false)} />}
      {recordsGame !== null && <BonusRecordsModal gameId={recordsGame.id} title={recordsGame.arena.title} skillCode={recordsGame.skill_code} currentUserId={currentUserId} onClose={() => setRecordsGame(null)} />}
      {previewGame !== null ? (
        <AccessibleModal
          title={previewGame.preview_title || previewGame.title}
          ariaLabel={`Описание игры «${previewGame.title}»`}
          copy={null}
          closeBlocked={startMutation.isPending}
          onRequestClose={() => {
            if (!startMutation.isPending) setPreviewGame(null);
          }}
          cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть"
              disabled={startMutation.isPending}
              onClick={() => setPreviewGame(null)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          }
        >
          <img
            className="bonus-game-preview-modal__artwork"
            src={versionBonusGameArtwork(previewGame.levels?.find((entry) => entry.level === selectedLevel)?.preview_artwork_url ?? previewGame.preview_artwork_url)}
            alt={`Локация «${previewGame.arena.title}» и её вратарь`}
          />
          <p className="modal-copy bonus-game-preview-modal__story">{previewGame.levels?.find((entry) => entry.level === selectedLevel)?.preview_story ?? (previewGame.challenge_environment?.cyberpunk ? CYBERPUNK_STORY : previewGame.preview_story)}</p>
          <p className="bonus-game-preview-modal__condition">
            {(previewGame.challenge_environment?.cyberpunk || previewGame.slug === 'challenge-beach' || (previewGame.slug === 'challenge-ski-resort' && previewGame.challenge_environment?.ski)) && <Target size={20} className="bonus-game-preview-modal__condition-icon" aria-hidden="true" />}
            {qualificationDescription(previewGame.qualification_rules).replace(/(\d+):(\d+)(?: мин)?/g, (_, minutes: string, seconds: string) => `${Number(minutes)} мин ${Number(seconds)} сек`)}
          </p>
          {previewGame.slug === 'challenge-beach' && previewGame.challenge_environment?.beach?.interactive && (
            <ul className="bonus-game-preview-modal__hints">
              {(!previewGame.levels || selectedLevel >= 2) && <li>Лужи замедляют шайбу. В глубокой воде она застревает.</li>}
              {(!previewGame.levels || selectedLevel >= 2) && <li>Тапай по лужам, чтобы убрать воду. Большой луже нужно больше тапов, но со временем она появится снова.</li>}
              <li>Ветер периодически сносит игрока, вратаря или ворота назад.</li>
              {(!previewGame.levels || selectedLevel === 3) && <li>На мокром льду игрок спотыкается, устаёт и берёт передышки.</li>}
            </ul>
          )}
          {previewGame.slug === 'challenge-ski-resort' && previewGame.challenge_environment?.ski && (
            <ul className="bonus-game-preview-modal__hints">
              {(!previewGame.levels || selectedLevel === 3) && <li>На подъёме игрок устаёт и едет всё медленнее. После передышки силы восстановятся.</li>}
              <li>С горы игрок, вратарь и ворота движутся быстрее, чем в гору.</li>
              {(!previewGame.levels || selectedLevel >= 2) && <li>На снегу все трое могут поскользнуться и съехать вниз.</li>}
              {(!previewGame.levels || selectedLevel >= 2) && <li>{previewGame.levels && selectedLevel === 2 ? 'Во время соскальзывания игрок не может бросать.' : 'Во время соскальзывания и передышки игрок не может бросать.'}</li>}
            </ul>
          )}
          {previewGame.slug==='challenge-cyberpunk-yard' && previewGame.challenge_environment?.cyberpunk && <CyberpunkHints level={previewGame.levels ? selectedLevel : 3}/>}
          {startMutation.isError ? (
            <p role="alert" className="bonus-game-abandon-error">
              {safeUiError(startMutation.error)}
            </p>
          ) : null}
          {previewGame.skill_code !== 'challenge' && <div className="bonus-records-entry">
            <dl className="bonus-records-entry__summary">
              <div><dt>Личный рекорд</dt><dd>{!previewGame.is_completed ? 'Пройди игру, чтобы установить свой рекорд' : previewRecords.isPending ? 'Загрузка…' : previewRecords.isError ? 'Не удалось загрузить' : previewRecords.data?.currentUser ? formatBonusRecord(previewGame.skill_code, previewRecords.data.currentUser) : 'Ещё не установлен'}</dd></div>
              <div><dt>Рекорд локации</dt><dd>{!previewGame.is_completed ? 'Откроется после прохождения' : previewRecords.isPending ? 'Загрузка…' : previewRecords.isError ? 'Не удалось загрузить' : previewRecords.data?.rows[0] ? formatBonusRecord(previewGame.skill_code, previewRecords.data.rows[0]) : 'Ещё не установлен'}</dd></div>
            </dl>
            <div className="bonus-records-entry__action-row">
            <p className="modal-copy bonus-records-entry__description">За новый рекорд – звёзды и опыт</p>
            {previewGame.is_completed ? (
              <button type="button" className="modal-primary btn btn--cta bonus-records-entry__button" onClick={() => { setRecordsGame(previewGame); setPreviewGame(null); }}>
                Рейтинг игроков
              </button>
            ) : <p className="modal-copy">Рекорды откроются после прохождения.</p>}
            </div>
          </div>}
          <div className="modal-actions">
            {previewGame.levels?.length ? <>
            {(() => { const entry = previewGame.levels.find((item) => item.level === selectedLevel)!; return <>
              {!entry.is_unlocked && <p className="modal-copy">Сначала пройди уровень {selectedLevel - 1}</p>}
              <div className={`bonus-game-level-reward${entry.is_completed ? ' bonus-game-level-reward--received' : ''}`} aria-label={`Награда: ${entry.reward.stars} звёзд · ${entry.reward.experience} опыта`}>
                <span style={{ color: rewardColor('star') }}><Star aria-hidden="true" fill="currentColor" />{entry.reward.stars}</span>
                <span style={{ color: rewardColor('experience') }}><TrendingUp aria-hidden="true" />{entry.reward.experience}</span>
              </div>
            </>; })()}
            <div className="bonus-game-levels__choices" role="group" aria-label="Уровень сложности">
              {previewGame.levels.map((entry) => <button key={entry.level} type="button"
                className={`btn btn--ghost bonus-game-level-choice--${entry.is_completed ? 'completed' : entry.is_unlocked ? 'available' : 'locked'}`} aria-pressed={selectedLevel === entry.level}
                disabled={!entry.is_unlocked}
                onClick={() => { if (entry.is_unlocked) setSelectedLevel(entry.level); }}>
                {entry.is_unlocked && <span className="bonus-game-level-choice__check" data-selected={selectedLevel === entry.level} aria-hidden="true">{selectedLevel === entry.level && <Check size={12} strokeWidth={3} />}</span>}
                Уровень {entry.level}
                <span className="bonus-game-levels__status">{entry.is_completed ? 'Пройден' : !entry.is_unlocked ? 'Закрыт' : 'Доступен'}</span>
              </button>)}
            </div>
            </> : null}
            <button
              type="button"
              className="modal-primary btn btn--cta"
              disabled={startMutation.isPending || previewGame.levels?.find((entry) => entry.level === selectedLevel)?.is_unlocked === false}
              onClick={() => startMutation.mutate(previewGame.id)}
            >
              {startMutation.isPending ? 'Подготавливаем…' : 'К игре'}
            </button>
          </div>
        </AccessibleModal>
      ) : null}
      {purchaseGame !== null ? (
        <AccessibleModal
          title="Открыть бонусную игру?"
          copy={`Открыть «${purchaseGame.title}» за ${numberText(purchaseGame.unlock_price_stars)} звезды?`}
          closeBlocked={purchaseMutation.isPending}
          onRequestClose={() => {
            if (purchaseMutation.isPending) return;
            purchaseMutation.reset();
            setPurchaseGame(null);
          }}
          headerAction={
            <button
              type="button"
              className="icon-btn"
              aria-label="Закрыть окно"
              disabled={purchaseMutation.isPending}
              onClick={() => {
                purchaseMutation.reset();
                setPurchaseGame(null);
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          }
        >
          {purchaseMutation.isError &&
          !wasAmateurLevelRequiredErrorHandled(purchaseMutation.error) ? (
            <p role="alert" className="bonus-game-abandon-error">
              {safeUiError(purchaseMutation.error)}
            </p>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={purchaseMutation.isPending}
              onClick={() => {
                purchaseMutation.reset();
                setPurchaseGame(null);
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="modal-primary btn btn--cta"
              disabled={purchaseMutation.isPending}
              onClick={() =>
                purchaseMutation.mutate({
                  gameId: purchaseGame.id,
                  expectedPriceStars: purchaseGame.unlock_price_stars,
                })
              }
            >
              {purchaseMutation.isPending
                ? 'Открываем…'
                : `Открыть за ${numberText(purchaseGame.unlock_price_stars)} звезды`}
            </button>
          </div>
        </AccessibleModal>
      ) : null}
      {switchGame !== null && activeAttempt !== null && activeGame !== undefined ? (
        <AccessibleModal
          title="Уже идёт другая игра"
          copy={`${skillLabels[activeGame.skill_code]} · ${activeGame.title}. Можно продолжить её или завершить попытку и начать выбранную игру.`}
          closeBlocked={switchAttemptMutation.isPending}
          onClose={() => {
            if (switchAttemptMutation.isPending) return;
            switchAttemptRequestRef.current = false;
            switchAttemptMutation.reset();
            setSwitchGame(null);
          }}
        >
          {switchAttemptMutation.isError &&
          !wasAmateurLevelRequiredErrorHandled(switchAttemptMutation.error) ? (
            <p role="alert" className="bonus-game-abandon-error">
              {safeUiError(switchAttemptMutation.error)}
            </p>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={switchAttemptMutation.isPending}
              onClick={continueActiveAttempt}
            >
              Продолжить текущую
            </button>
            <button
              type="button"
              className="modal-primary btn btn--cta"
              disabled={switchAttemptMutation.isPending}
              onClick={abandonAndOpenGame}
            >
              {switchAttemptMutation.isPending ? 'Завершаем…' : 'Завершить и начать эту'}
            </button>
          </div>
        </AccessibleModal>
      ) : null}
    </main>
  );
}

function BonusGamesRulesModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <AccessibleModal title="Правила бонусных игр" onClose={onClose}>
      <ol className="bonus-games-rules">
        <li>Игры открываются последовательно: сначала нужно пройти предыдущую.</li>
        <li>Число ежедневных попыток указано над списком выбранного навыка.</li>
        <li>Для прохождения выполните указанную цель за доступные периоды и броски.</li>
        <li>Монеты, звёзды и опыт начисляются только за первое прохождение.</li>
        <li>Пройденные игры можно повторять, но без повторной награды.</li>
      </ol>
      <div className="modal-actions">
        <button type="button" className="modal-primary btn btn--cta" onClick={onClose}>
          Понятно
        </button>
      </div>
    </AccessibleModal>
  );
}

function BonusGameCard({
  game,
  actionLabel: label,
  isStarting,
  canStartNewAttempt,
  onAction,
  featured = false,
  compact = false,
}: {
  game: BonusGameCard;
  actionLabel: string;
  isStarting: boolean;
  canStartNewAttempt: boolean;
  onAction: () => void;
  featured?: boolean;
  compact?: boolean;
}): JSX.Element {
  const isContinuable = game.active_attempt !== null || game.state === 'in_progress';
  const explainsLevelLock = game.state === 'level_locked';
  const isPurchasable = game.state === 'purchase_required';
  const canAct =
    isUnreleasedChallenge(game) || isContinuable || explainsLevelLock || isPurchasable || (isPlayable(game) && canStartNewAttempt);
  const showsChevron = isContinuable || (isPlayable(game) && canStartNewAttempt);
  const visibleActionLabel =
    !isContinuable && isPlayable(game) && !canStartNewAttempt ? 'Попытки закончились' : label;
  const firstClearRewards = [
    {
      label: 'Монеты',
      value: game.reward.coins,
      tone: 'coin' as const,
      icon: <CircleDollarSign size={15} strokeWidth={2.55} />,
    },
    {
      label: 'Звёзды',
      value: game.reward.stars,
      tone: 'star' as const,
      icon: <Star size={15} strokeWidth={2.55} fill="currentColor" />,
    },
    {
      label: 'Опыт',
      value: game.reward.experience,
      tone: 'experience' as const,
      icon: <TrendingUp size={15} strokeWidth={2.55} />,
    },
  ].filter((reward) => reward.value > 0);
  const totalShots = game.period_rules.reduce(
    (total, period) => total + (period.shots_limit ?? 0),
    0,
  );
  const visualStatus = bonusGameVisualStatus(game);
  const artworkIsLocked = visualStatus === 'locked';
  const statusText =
    visualStatus === 'completed'
      ? 'Пройдена'
      : visualStatus === 'available'
        ? 'Не пройдена'
        : 'Закрыта';
  const isWorldTourArtwork = game.arena.thumbnail_url.includes('/bonus-games/world-tour/');
  const featuredArtworkPosition =
    featured && isWorldTourArtwork
      ? game.arena.slug === 'accuracy-world-tour-moscow'
        ? 'center 50%'
        : 'center 43%'
      : 'center top';
  const enduranceDetails =
    game.qualification_rules.type === 'survive_goal_windows'
      ? enduranceQualificationLines(game.qualification_rules)
      : null;

  return (
    <article
      className={`bonus-game-card${featured ? ' bonus-game-card--featured' : ''}${featured && isWorldTourArtwork ? ' bonus-game-card--world-tour' : ''}${compact ? ' bonus-game-card--compact' : ''}${game.state === 'completed' ? ' bonus-game-card--completed' : ''}`}
    >
      {(canAct || (!isContinuable && isPlayable(game))) && (
        <button
          type="button"
          className={`bonus-game-card__hit-area${isStarting ? ' bonus-game-card__hit-area--starting' : ''}${!canAct ? ' bonus-game-card__hit-area--unavailable' : ''}`}
          disabled={isStarting || !canAct}
          onClick={onAction}
          aria-label={isStarting ? 'Подготавливаем…' : visibleActionLabel}
        />
      )}
      <div className="bonus-game-card__artwork-frame">
        <img
          className={`bonus-game-card__artwork${game.state === 'completed' ? ' bonus-game-card__artwork--completed' : ''}${artworkIsLocked ? ' bonus-game-card__artwork--locked' : ''}`}
          src={catalogBonusGameArtwork(game.arena.thumbnail_url, featured ? 'featured' : 'compact')}
          alt={`Площадка «${game.arena.title}»`}
          loading={compact ? 'lazy' : 'eager'}
          style={{
            objectPosition: featuredArtworkPosition,
          }}
        />
        {visualStatus === 'completed' ? (
          <span className="bonus-game-card__completion-badge" aria-label="Игра пройдена">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="bonus-game-card__content">
        <span
          className={`achievement-card__stage bonus-game-card__status bonus-game-card__status--${visualStatus} training-exercise-card__stage--${visualStatus === 'completed' ? 'complete' : visualStatus}`}
        >
          {statusText}
        </span>
        <div className="bonus-game-card__eyebrow">Игра {numberText(game.sort_order)}</div>
        <h2 className="bonus-game-card__title">{game.title}</h2>
        {!featured && game.description ? (
          <p className="bonus-game-card__description">{game.description}</p>
        ) : null}
        <p className="bonus-game-card__details">
          {game.levels?.length ? <span className="bonus-game-card__details-secondary">Уровни: {game.levels.filter((entry) => entry.is_completed).length} из 3</span> : null}
          <span className="bonus-game-card__details-primary">
            {enduranceDetails?.[0] ?? qualificationDescription(game.qualification_rules)}
          </span>
          {enduranceDetails !== null ? (
            <span className="bonus-game-card__details-window">{enduranceDetails[1]}</span>
          ) : null}
          <span className="bonus-game-card__details-secondary">
            {formatRussianCount(game.total_periods, 'период', 'периода', 'периодов')} ·{' '}
            {game.qualification_rules.type === 'goals_from_shots'
              ? formatRussianCount(totalShots, 'бросок', 'броска', 'бросков')
              : 'без лимита бросков'}
          </span>
        </p>
        {game.state === 'completed' && !compact ? (
          <p className="bonus-game-card__reward-note">Повторная игра без награды</p>
        ) : firstClearRewards.length > 0 ? (
          <div
            className={`bonus-game-card__reward${game.state === 'completed' ? ' bonus-game-card__reward--muted' : ''}`}
          >
            {!compact && (
              <span className="bonus-game-card__reward-title">За первое прохождение:</span>
            )}
            <div className="bonus-game-card__reward-list">
              {firstClearRewards.map((reward) => (
                <BonusGameReward
                  key={reward.tone}
                  label={reward.label}
                  value={reward.value}
                  tone={reward.tone}
                  icon={reward.icon}
                />
              ))}
            </div>
          </div>
        ) : null}
        <span
          className={`card-chevron bonus-game-card__chevron${showsChevron ? '' : ' bonus-game-card__chevron--hidden'}`}
          aria-hidden="true"
        >
          <ChevronRight size={19} strokeWidth={2.7} />
        </span>
      </div>
    </article>
  );
}

function BonusGameReward({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: RewardTone;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <span className="bonus-game-card__reward-item" aria-label={`${label}: ${value}`}>
      <span
        className="bonus-game-card__reward-icon"
        style={{ color: rewardColor(tone) }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span>{numberText(value)}</span>
    </span>
  );
}
