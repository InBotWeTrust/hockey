import { CircleDollarSign, Star } from 'lucide-react';
import { rewardColor } from '../app/rewardColors.js';
const numberText = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
export function ShopProductCard({
  title,
  artworkUrl,
  description,
  coinPrice,
  starPrice,
  canBuy,
  coinAffordable,
  isBuying,
  onDetails,
  onBuy,
}: {
  title: string;
  artworkUrl: string;
  description: string;
  coinPrice: number;
  starPrice: number;
  canBuy: boolean;
  coinAffordable: boolean;
  isBuying: boolean;
  onDetails: () => void;
  onBuy: () => void;
}): JSX.Element {
  return (
    <article
      className="glass inventory-product-card"
      style={{
        minWidth: 0,
        minHeight: 116,
        padding: 10,
        borderRadius: 22,
        display: 'grid',
        gridTemplateColumns: '94px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 12,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Подробнее о ${title}`}
        style={{
          minWidth: 0,
          height: 94,
          border: '1px solid rgba(255,255,255,0.78)',
          padding: 0,
          overflow: 'hidden',
          background: 'var(--liquid-inset-bg)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.78), 0 8px 14px rgba(15,23,42,0.08)',
          cursor: 'pointer',
        }}
      >
        <img
          src={artworkUrl}
          alt=""
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
        />
      </button>
      <button
        type="button"
        onClick={onDetails}
        aria-label={`Открыть ${title}`}
        style={{
          minWidth: 0,
          border: 0,
          padding: 0,
          background: 'transparent',
          color: 'inherit',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 5,
          alignContent: 'start',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <h2
          style={{
            margin: 0,
            minWidth: 0,
            color: 'var(--ink)',
            fontWeight: 950,
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {title}
        </h2>
        <div
          style={{
            minHeight: '2.4em',
            color: 'var(--muted)',
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          {description}
        </div>
        <div
          className="inventory-product-card__price"
          aria-label={`${numberText(coinPrice)} монет или ${numberText(starPrice)} звёзд`}
          style={{
            fontSize: 13,
            fontWeight: 950,
            lineHeight: 1.1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span
            style={{
              color: rewardColor('coin'),
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <CircleDollarSign size={14} fill="none" stroke="currentColor" aria-hidden="true" />
            {numberText(coinPrice)}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>или</span>
          <span
            style={{
              color: rewardColor('star'),
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Star size={13} fill="currentColor" aria-hidden="true" />
            {numberText(starPrice)}
          </span>
        </div>
      </button>
      <button
        type="button"
        className="btn btn--cta"
        disabled={!canBuy || isBuying}
        onClick={onBuy}
        aria-label={
          !coinAffordable && canBuy
            ? `Выбрать способ покупки ${title}`
            : canBuy
              ? `Купить ${title} за ${numberText(coinPrice)} монет`
              : `Не хватает монет на ${title}`
        }
        style={{
          minWidth: 86,
          minHeight: 38,
          padding: '0 12px',
          fontSize: 12,
          opacity: !canBuy ? 0.5 : undefined,
          cursor: !canBuy ? 'not-allowed' : undefined,
        }}
      >
        {isBuying ? 'Покупка...' : canBuy ? 'Купить' : 'Не хватает'}
      </button>
    </article>
  );
}
