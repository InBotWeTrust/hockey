import { X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { PurchaseAction } from './PurchaseAction.js';
export function ShopPurchaseModal({
  title,
  copy,
  coinPrice,
  starPrice,
  canBuyCoins,
  canBuyStars,
  isSaving,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  copy: string;
  coinPrice: number;
  starPrice: number;
  canBuyCoins: boolean;
  canBuyStars: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (currency: 'coins' | 'stars') => void;
}): JSX.Element {
  return (
    <AccessibleModal
      title={title}
      copy={copy}
      onRequestClose={onClose}
      closeBlocked={isSaving}
      backdropStyle={{ zIndex: 430 }}
      cardStyle={{ width: 'min(390px, calc(100vw - 28px))' }}
      headerAction={
        <button
          type="button"
          className="icon-btn"
          aria-label="Закрыть"
          disabled={isSaving}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {error !== null && (
          <div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          <PurchaseAction amount={coinPrice} currency="coins" pending={isSaving} disabled={!canBuyCoins} onClick={() => onConfirm('coins')}/>
          <PurchaseAction amount={starPrice} currency="stars" pending={isSaving} disabled={!canBuyStars} onClick={() => onConfirm('stars')}/>

        </div>
      </div>
    </AccessibleModal>
  );
}
