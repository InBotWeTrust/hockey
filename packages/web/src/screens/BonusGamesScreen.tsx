import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  fetchBonusGames,
  purchaseBonusGame,
  startBonusAttempt,
  type BonusGameCard,
} from '../api/bonusGames.js';
import { ApiError } from '../api/apiFetch.js';
import { fetchMyInventory } from '../api/inventory.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { formatRussianCount } from '../lib/russianPlural.js';

const SAFE_UI_ERROR_MESSAGE = 'Не удалось выполнить запрос. Попробуйте ещё раз.';

function safeUiError(error: unknown): string {
  return error instanceof ApiError ? error.message : SAFE_UI_ERROR_MESSAGE;
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function cardStatusText(game: BonusGameCard): string {
  if (game.state === 'level_locked') return 'Нужен любительский уровень';
  if (game.state === 'sequence_locked') {
    return game.prerequisite ? `Нужно пройти: ${game.prerequisite.title}` : 'Обновите каталог.';
  }
  if (game.state === 'purchase_required') {
    return `Открытие: ${formatRussianCount(game.unlock_price_stars, 'звезда', 'звезды', 'звёзд')}`;
  }
  if (game.state === 'in_progress') return 'Попытка в процессе';
  if (game.state === 'completed') return 'Пройдено · повтор без награды';
  if (game.state === 'archived') return 'Недоступна для новых попыток';
  return 'Готова к игре';
}

function actionLabel(game: BonusGameCard): string {
  if (game.state === 'purchase_required') {
    return `Открыть за ${formatRussianCount(game.unlock_price_stars, 'звезду', 'звезды', 'звёзд')}`;
  }
  if (game.state === 'in_progress' || game.active_attempt !== null) return 'Продолжить';
  if (game.state === 'completed') return 'Играть снова';
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
          <div>
            <div className="section-label section-label--page">Разделы</div>
            <h1 id="bonus-games-title" className="bonus-games-catalog__title">
              Бонусные игры
            </h1>
          </div>
        </header>

        {catalogQuery.isLoading ? (
          <div className="bonus-games-catalog__notice" role="status">
            Загружаем бонусные игры…
          </div>
        ) : catalogQuery.isError ? (
          <div className="bonus-games-catalog__notice" role="alert">
            {safeUiError(catalogQuery.error)}
          </div>
        ) : catalogQuery.data?.games.length === 0 ? (
          <div className="bonus-games-catalog__notice">Сейчас нет доступных бонусных игр.</div>
        ) : (
          <div className="bonus-games-catalog__grid">
            {catalogQuery.data?.games.map((game) => (
              <BonusGameCard
                key={game.id}
                game={game}
                actionLabel={actionLabel(game)}
                isStarting={startMutation.isPending && startMutation.variables === game.id}
                onAction={() => openGame(game)}
              />
            ))}
          </div>
        )}

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
    </main>
  );
}

function BonusGameCard({
  game,
  actionLabel: label,
  isStarting,
  onAction,
}: {
  game: BonusGameCard;
  actionLabel: string;
  isStarting: boolean;
  onAction: () => void;
}): JSX.Element {
  const canAct =
    game.state === 'purchase_required' || game.active_attempt !== null || isPlayable(game);
  const firstReward =
    game.state === 'completed'
      ? 'Повторная игра без награды'
      : `За первое прохождение: ${formatRussianCount(
          game.reward.coins,
          'монета',
          'монеты',
          'монет',
        )} · ${formatRussianCount(
          game.reward.stars,
          'звезда',
          'звезды',
          'звёзд',
        )} · ${formatRussianCount(
          game.reward.experience,
          'очко опыта',
          'очка опыта',
          'очков опыта',
        )}`;
  const totalShots = game.period_rules.reduce((total, period) => total + period.shots_limit, 0);

  return (
    <article className="bonus-game-card">
      <img
        className="bonus-game-card__artwork"
        src={game.arena.thumbnail_url}
        alt={`Площадка «${game.arena.title}»`}
      />
      <div className="bonus-game-card__content">
        <div className="bonus-game-card__eyebrow">Игра {numberText(game.sort_order)}</div>
        <h2 className="bonus-game-card__title">{game.title}</h2>
        {game.description && <p className="bonus-game-card__description">{game.description}</p>}
        <p className="bonus-game-card__status">{cardStatusText(game)}</p>
        <p className="bonus-game-card__details">
          Цель: {formatRussianCount(game.target_goals, 'шайба', 'шайбы', 'шайб')} ·{' '}
          {formatRussianCount(game.total_periods, 'период', 'периода', 'периодов')} ·{' '}
          {formatRussianCount(totalShots, 'бросок', 'броска', 'бросков')}
        </p>
        <p className="bonus-game-card__reward">{firstReward}</p>
        <p className="bonus-game-card__arena">Новая домашняя площадка: {game.arena.title}</p>
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
