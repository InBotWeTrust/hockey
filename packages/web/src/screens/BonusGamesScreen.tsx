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
import { fetchMyInventory } from '../api/inventory.js';
import { BONUS_GAME_ASSETS } from '../game/bonusGameAssets.js';

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU', { useGrouping: false }).format(value);
}

function approvedArenaArtwork(game: BonusGameCard): string {
  const knownAssets = BONUS_GAME_ASSETS[game.slug as keyof typeof BONUS_GAME_ASSETS];
  return knownAssets?.arena ?? game.arena.thumbnail_url;
}

function cardStatusText(game: BonusGameCard): string {
  if (game.state === 'level_locked') return 'Нужен любительский уровень';
  if (game.state === 'sequence_locked') {
    return game.prerequisite ? `Нужно пройти: ${game.prerequisite.title}` : 'Обновите каталог.';
  }
  if (game.state === 'purchase_required') {
    return `Открытие: ${numberText(game.unlock_price_stars)} звезда`;
  }
  if (game.state === 'in_progress') return 'Попытка в процессе';
  if (game.state === 'completed') return 'Пройдено · повтор без награды';
  if (game.state === 'archived') return 'Недоступна для новых попыток';
  return 'Готова к игре';
}

function actionLabel(game: BonusGameCard): string {
  if (game.state === 'purchase_required') {
    return `Открыть за ${numberText(game.unlock_price_stars)} звезду`;
  }
  if (game.state === 'in_progress') return 'Продолжить';
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
  const catalogQuery = useQuery({ queryKey: ['bonus-games'], queryFn: fetchBonusGames });
  const inventoryQuery = useQuery({ queryKey: ['inventory', 'me'], queryFn: fetchMyInventory });
  const startMutation = useMutation({
    mutationFn: startBonusAttempt,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['bonus-games'] });
      navigate(`/bonus-games/${response.attempt.game_id}/play`);
    },
  });
  const purchaseMutation = useMutation({
    mutationFn: purchaseBonusGame,
    onSuccess: async () => {
      setPurchaseGame(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bonus-games'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory', 'me'] }),
      ]);
    },
  });

  const openGame = (game: BonusGameCard): void => {
    if (game.state === 'purchase_required') {
      purchaseMutation.reset();
      setPurchaseGame(game);
      return;
    }
    if (game.state === 'in_progress') {
      navigate(`/bonus-games/${game.id}/play`);
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
            {catalogQuery.error.message}
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
            {startMutation.error.message}
          </div>
        )}
      </section>

      {purchaseGame && (
        <PurchaseBonusGameModal
          game={purchaseGame}
          starBalance={inventoryQuery.data?.balances.stars}
          balanceLoading={inventoryQuery.isLoading}
          balanceError={inventoryQuery.isError ? inventoryQuery.error.message : null}
          isPurchasing={purchaseMutation.isPending}
          error={purchaseMutation.isError ? purchaseMutation.error.message : null}
          onClose={() => {
            if (purchaseMutation.isPending) return;
            purchaseMutation.reset();
            setPurchaseGame(null);
          }}
          onConfirm={() => purchaseMutation.mutate(purchaseGame.id)}
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
    game.state === 'purchase_required' || game.state === 'in_progress' || isPlayable(game);
  const firstReward =
    game.state === 'completed'
      ? 'Повторная игра без награды'
      : `За первое прохождение: ${numberText(game.reward.coins)} монет · ${numberText(
          game.reward.stars,
        )} звезда · ${numberText(game.reward.experience)} опыта`;

  return (
    <article className="bonus-game-card">
      <img
        className="bonus-game-card__artwork"
        src={approvedArenaArtwork(game)}
        alt={`Площадка «${game.arena.title}»`}
      />
      <div className="bonus-game-card__content">
        <div className="bonus-game-card__eyebrow">Игра {numberText(game.sort_order)}</div>
        <h2 className="bonus-game-card__title">{game.title}</h2>
        {game.description && <p className="bonus-game-card__description">{game.description}</p>}
        <p className="bonus-game-card__status">{cardStatusText(game)}</p>
        <p className="bonus-game-card__details">
          Цель: {numberText(game.target_goals)} шайб · {numberText(game.total_periods)} периодов ·{' '}
          {numberText(game.period_rules.reduce((total, period) => total + period.shots_limit, 0))}{' '}
          бросков
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
  const price = numberText(game.unlock_price_stars);
  const balanceCopy = balanceLoading
    ? 'Проверяем баланс звёзд…'
    : balanceError
      ? balanceError
      : `Стоимость: ${price} звезда. На балансе: ${numberText(starBalance ?? 0)} звезда.`;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Открыть игру?"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">Открыть игру?</h2>
        <p className="modal-copy">
          {game.title}. Открытие оплачивается один раз, а повторные попытки будут бесплатными.
        </p>
        <p className="modal-copy">{balanceCopy}</p>
        {error && (
          <p className="bonus-games-purchase-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={isPurchasing}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="modal-primary btn btn--cta"
            disabled={isPurchasing || balanceLoading || balanceError !== null}
            onClick={onConfirm}
          >
            {isPurchasing ? 'Открываем…' : `Открыть за ${price} звезду`}
          </button>
        </div>
      </section>
    </div>
  );
}
