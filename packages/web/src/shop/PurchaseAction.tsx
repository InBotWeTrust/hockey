import { CircleDollarSign, Star } from 'lucide-react';
import './purchase-action.css';
export type PurchaseCurrency = 'coins' | 'stars';
const numberText = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
export function CurrencyAmount({ amount, currency, onAction = false }: { amount: number; currency: PurchaseCurrency; onAction?: boolean }) {
  return <span className={`currency-amount currency-amount--${currency}${onAction ? ' currency-amount--on-action' : ''}`} aria-label={`${numberText(amount)} ${currency === 'coins' ? 'монет' : 'звёзд'}`}>
    {numberText(amount)}
    {currency === 'coins' ? <CircleDollarSign size={17} strokeWidth={2.2} aria-hidden="true"/> : <Star size={16} fill="currentColor" aria-hidden="true"/>}
  </span>;
}
export function PurchaseAction({ amount, currency, onClick, disabled = false, pending = false, pendingLabel = 'Покупка...', verb = 'Купить за', suffix = '', ariaLabel }: {
  amount: number; currency: PurchaseCurrency; onClick: () => void; disabled?: boolean; pending?: boolean;
  pendingLabel?: string; verb?: string; suffix?: string; ariaLabel?: string;
}) {
  const label = pending ? pendingLabel : ariaLabel ?? `${verb} ${numberText(amount)} ${currency === 'coins' ? 'монет' : 'звёзд'}${suffix ? ` ${suffix}` : ''}`;
  return <button type="button" className="modal-primary btn btn--cta purchase-action" aria-label={label}
    disabled={disabled || pending} onClick={onClick}>
    {pending ? pendingLabel : <>{verb} <CurrencyAmount amount={amount} currency={currency} onAction/>{suffix ? ` ${suffix}` : null}</>}
  </button>;
}
