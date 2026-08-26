import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleDollarSign, Info, Star, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { rewardColor, type RewardTone } from '../app/rewardColors.js';
import {
  fetchBonusGames,
  purchaseBonusGame,
  startBonusAttempt,
  type BonusGameCard,
  type BonusSkillCode,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import { fetchMyInventory } from '../api/inventory.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { formatRussianCount } from '../lib/russianPlural.js';
import { qualificationDescription } from '../game/bonusGameQualification.js';

const SAFE_UI_ERROR_MESSAGE = 'Не удалось выполнить запрос. Попробуйте ещё раз.';
const LAST_SKILL_STORAGE_KEY = 'bonus-games:last-skill';

const skillLabels: Record<BonusSkillCode, string> = {
  speed: 'Скорость',
  accuracy: 'Точность',
};

function safeUiError(error: unknown): string {
  return error instanceof ApiError ? error.message : SAFE_UI_ERROR_MESSAGE;
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function actionLabel(game: BonusGameCard): string {
  if (game.state === 'purchase_required') {
    return `Открыть за ${formatRussianCount(game.unlock_price_stars, 'звезду', 'звезды', 'звёзд')}`;
  }
  if (game.state === 'in_progress' || game.active_attempt !== null) return 'Продолжить';
  if (game.state === 'completed') return 'Повторить';
  if (game.state === 'available') return 'Играть';
  return game.state === 'archived' ? 'Недоступна' : 'Закрыта';
}

function isPlayable(game: BonusGameCard): boolean {
  return game.state === 'available' || game.state === 'completed';
}

export function BonusGamesScreen(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [purchaseGame, setPurchaseGame] = useState<BonusGameCard | null>(null);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<BonusSkillCode>(() =>
    localStorage.getItem(LAST_SKILL_STORAGE_KEY) === 'accuracy' ? 'accuracy' : 'speed',
  );
  const catalogQuery = useQuery({ queryKey: ['bonus-games'], queryFn: fetchBonusGames });
  const inventoryQuery = useQuery({ queryKey: ['inventory', 'me'], queryFn: fetchMyInventory });
  const startMutation = useMutation({
    mutationFn: startBonusAttempt,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['bonus-games'] });
      navigate(
        `/bonus-games/${response.attempt.game_id}/play?attempt=${encodeURIComponent(response.attempt.id)}`,
      );
    },
  });
  const purchaseMutation = useMutation({
    mutationFn: purchaseBonusGame,
    onMutate: () => setPurchaseNotice(null),
    onSuccess: async () => {
      setPurchaseGame(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bonus-games'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', 'me'] }),
      ]);
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.code !== 'bonus_price_changed') return;
      setPurchaseGame(null);
      setPurchaseNotice(error.message);
      void queryClient.invalidateQueries({ queryKey: ['bonus-games'] });
    },
  });

  const openGame = (game: BonusGameCard): void => {
    if (
      catalogQuery.data?.active_attempt !== null &&
      catalogQuery.data?.active_attempt !== undefined &&
      game.active_attempt === null
    ) {
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
    if (isPlayable(game)) startMutation.mutate(game.id);
  };
  const allGames = catalogQuery.data?.games ?? [];
  const games = allGames.filter((game) => game.skill_code === selectedSkill);
  const activeGame = allGames.find(
    (game) => game.active_attempt?.id === catalogQuery.data?.active_attempt?.id,
  );
  const activeAttemptInOtherSkill =
    activeGame !== undefined && activeGame.skill_code !== selectedSkill ? activeGame : null;
  const selectSkill = (skill: BonusSkillCode): void => {
    setSelectedSkill(skill);
    localStorage.setItem(LAST_SKILL_STORAGE_KEY, skill);
  };
  const focusGame =
    games.find((game) => game.active_attempt !== null) ??
    games.find((game) => game.state === 'in_progress') ??
    games.find((game) => game.state === 'available' || game.state === 'purchase_required') ??
    [...games].reverse().find((game) => game.state === 'completed') ??
    games[0] ??
    null;
  const completedGames = games.filter(
    (game) => game.state === 'completed' && game.id !== focusGame?.id,
  );
  const futureGames = games.filter(
    (game) =>
      game.id !== focusGame?.id &&
      game.state !== 'completed' &&
      game.state !== 'available' &&
      game.state !== 'purchase_required' &&
      game.state !== 'in_progress',
  );

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
            <h1
              id="bonus-games-title"
              className="bonus-games-catalog__title screen-title-on-arena"
            >
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
          />
        </div>

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
        ) : focusGame !== null ? (
          <div className="bonus-games-catalog__groups">
            <section className="bonus-games-focus" aria-label="Текущая квалификация">
              <BonusGameCard
                game={focusGame}
                actionLabel={actionLabel(focusGame)}
                isStarting={startMutation.isPending && startMutation.variables === focusGame.id}
                onAction={() => openGame(focusGame)}
                blockedByOtherAttempt={activeAttemptInOtherSkill !== null}
                featured={true}
              />
            </section>
            {completedGames.length > 0 ? (
              <details className="bonus-games-group" open>
                <summary className="section-label sections-group__title">
                  Пройденные · {completedGames.length}
                </summary>
                <div className="bonus-games-catalog__grid">
                  {completedGames.map((game) => (
                    <BonusGameCard
                      key={game.id}
                      game={game}
                      actionLabel={actionLabel(game)}
                      isStarting={startMutation.isPending && startMutation.variables === game.id}
                      onAction={() => openGame(game)}
                      blockedByOtherAttempt={activeAttemptInOtherSkill !== null}
                    />
                  ))}
                </div>
              </details>
            ) : null}
            {futureGames.length > 0 ? (
              <section className="bonus-games-group" aria-labelledby="bonus-games-next-title">
                <h2
                  id="bonus-games-next-title"
                  className="section-label sections-group__title"
                >
                  Дальше
                </h2>
                <div className="bonus-games-catalog__grid bonus-games-catalog__grid--compact">
                  {futureGames.map((game) => (
                    <BonusGameCard
                      key={game.id}
                      game={game}
                      actionLabel={actionLabel(game)}
                      isStarting={false}
                      onAction={() => openGame(game)}
                      blockedByOtherAttempt={activeAttemptInOtherSkill !== null}
                      compact={true}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {startMutation.isError && (
          <div className="bonus-games-catalog__notice" role="alert">
            {safeUiError(startMutation.error)}
          </div>
        )}
        {purchaseNotice !== null && (
          <div className="bonus-games-catalog__notice" role="alert">
            {purchaseNotice}
          </div>
        )}
      </section>

      {purchaseGame && (
        <PurchaseBonusGameModal
          game={purchaseGame}
          starBalance={inventoryQuery.data?.balances.stars}
          balanceLoading={inventoryQuery.isLoading}
          balanceError={inventoryQuery.isError ? safeUiError(inventoryQuery.error) : null}
          isPurchasing={purchaseMutation.isPending}
          error={purchaseMutation.isError ? safeUiError(purchaseMutation.error) : null}
          onClose={() => {
            if (purchaseMutation.isPending) return;
            purchaseMutation.reset();
            setPurchaseGame(null);
          }}
          onConfirm={() =>
            purchaseMutation.mutate({
              gameId: purchaseGame.id,
              expectedPriceStars: purchaseGame.unlock_price_stars,
            })
          }
        />
      )}
      {rulesOpen && <BonusGamesRulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  );
}

function BonusGamesRulesModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <AccessibleModal title="Правила бонусных игр" onClose={onClose}>
      <ol className="bonus-games-rules">
        <li>Игры открываются последовательно: сначала нужно пройти предыдущую.</li>
        <li>Некоторые игры бесплатные, другие нужно один раз открыть за звёзды.</li>
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
  onAction,
  featured = false,
  compact = false,
  blockedByOtherAttempt = false,
}: {
  game: BonusGameCard;
  actionLabel: string;
  isStarting: boolean;
  onAction: () => void;
  featured?: boolean;
  compact?: boolean;
  blockedByOtherAttempt?: boolean;
}): JSX.Element {
  const canAct =
    !blockedByOtherAttempt &&
    (game.state === 'purchase_required' || game.active_attempt !== null || isPlayable(game));
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

  return (
    <article
      className={`bonus-game-card${featured ? ' bonus-game-card--featured' : ''}${compact ? ' bonus-game-card--compact' : ''}`}
    >
      <div className="bonus-game-card__artwork-frame">
        <img
          className="bonus-game-card__artwork"
          src={game.arena.thumbnail_url}
          alt={`Площадка «${game.arena.title}»`}
          style={{ objectPosition: 'center top' }}
        />
      </div>
      <div className="bonus-game-card__content">
        <div className="bonus-game-card__eyebrow">Игра {numberText(game.sort_order)}</div>
        <h2 className="bonus-game-card__title">{game.title}</h2>
        {game.description && <p className="bonus-game-card__description">{game.description}</p>}
        <p className="bonus-game-card__details">
          {qualificationDescription(game.qualification_rules)} ·{' '}
          {formatRussianCount(game.total_periods, 'период', 'периода', 'периодов')} ·{' '}
          {game.qualification_rules.type === 'goals_from_shots'
            ? formatRussianCount(totalShots, 'бросок', 'броска', 'бросков')
            : 'без лимита бросков'}
        </p>
        {game.state === 'completed' ? (
          <p className="bonus-game-card__reward-note">Повторная игра без награды</p>
        ) : firstClearRewards.length > 0 ? (
          <div className="bonus-game-card__reward">
            <span className="bonus-game-card__reward-title">За первое прохождение</span>
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
        <button
          type="button"
          className="btn btn--cta bonus-game-card__action"
          disabled={!canAct || isStarting}
          onClick={onAction}
        >
          {isStarting ? 'Подготавливаем…' : label}
        </button>
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

function PurchaseBonusGameModal({
  game,
  starBalance,
  balanceLoading,
  balanceError,
  isPurchasing,
  error,
  onClose,
  onConfirm,
}: {
  game: BonusGameCard;
  starBalance: number | undefined;
  balanceLoading: boolean;
  balanceError: string | null;
  isPurchasing: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const price = formatRussianCount(game.unlock_price_stars, 'звезда', 'звезды', 'звёзд');
  const actionPrice = formatRussianCount(game.unlock_price_stars, 'звезду', 'звезды', 'звёзд');
  const balanceCopy = balanceLoading
    ? 'Проверяем баланс звёзд…'
    : balanceError
      ? balanceError
      : `Стоимость: ${price}. На балансе: ${formatRussianCount(
          starBalance ?? 0,
          'звезда',
          'звезды',
          'звёзд',
        )}.`;

  return (
    <AccessibleModal
      title="Открыть игру?"
      copy={`${game.title}. Открытие оплачивается один раз, а повторные попытки будут бесплатными.`}
      closeBlocked={isPurchasing}
      onClose={onClose}
    >
      <p className="modal-copy">{balanceCopy}</p>
      {error && (
        <p className="bonus-games-purchase-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" disabled={isPurchasing} onClick={onClose}>
          Отмена
        </button>
        <button
          type="button"
          className="modal-primary btn btn--cta"
          disabled={isPurchasing || balanceLoading || balanceError !== null}
          onClick={onConfirm}
        >
          {isPurchasing ? 'Открываем…' : `Открыть за ${actionPrice}`}
        </button>
      </div>
    </AccessibleModal>
  );
}
