import { X } from 'lucide-react';
import { useAuthStore } from '../auth/authStore.js';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VisitorProduct, VisitorState } from '@hockey/game-core';
import { apiFetch, ApiError } from '../api/apiFetch.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { useVisitor, visitorChanged, visitorTime } from './visitorApi.js';
import { VISITOR_CARD_ART } from './VisitorCardSlot.js';
import './visitor-card.css';
export function VisitorShop({ onClose }: { onClose?: () => void }) {
  const owner = useAuthStore((state) => state.user?.id) ?? 'preview';
  const requestKey = `bar-visitor-purchase:${owner}`;
  const { data, error, refresh } = useVisitor();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<{
    product: VisitorProduct;
    currency: 'coins' | 'stars';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) confirmation.current?.focus();
  }, [selected]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pending = useRef<{
    id: string;
    productId: string;
    currency: 'coins' | 'stars';
    expectedPrice: number;
    expectedRevision: number;
  } | null>(
    (() => {
      try {
        return JSON.parse(sessionStorage.getItem(requestKey) ?? 'null');
      } catch {
        return null;
      }
    })(),
  );
  useEffect(() => {
    if (data && pending.current && !selected) {
      const product = data.settings.products.find((p) => p.id === pending.current?.productId);
      if (product) setSelected({ product, currency: pending.current.currency });
    }
  }, [data, selected]);
  const buy = async () => {
    if (!data || !selected || busy) return;
    setBusy(true);
    setNotice('');
    const input = pending.current ?? {
      id: crypto.randomUUID(),
      productId: selected.product.id,
      currency: selected.currency,
      expectedPrice: selected.product[selected.currency],
      expectedRevision: data.revision,
    };
    pending.current = input;
    sessionStorage.setItem(requestKey, JSON.stringify(input));
    try {
      await apiFetch<VisitorState>('/bar/visitor/purchases', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      pending.current = null;
      sessionStorage.removeItem(requestKey);
      if (!mounted.current) return;
      setSelected(null);
      setNotice('Покупка готова. Можно продолжать!');
      visitorChanged();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        refresh(),
      ]);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Покупка не прошла. Попробуй ещё раз.');
      if (cause instanceof ApiError && cause.status < 500) {
        pending.current = null;
        sessionStorage.removeItem(requestKey);
        setSelected(null);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };
  const content = (
    <section className="visitor-shop" aria-label="Товары бара">
      <img
        className="visitor-card-art"
        src={VISITOR_CARD_ART}
        alt="Карта посетителя 4-го периода"
      />
      {error && (
        <p role="alert">
          Не удалось загрузить товары.{' '}
          <button className="btn btn--ghost" onClick={() => void refresh()}>
            Повторить
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Загружаем товары…</p>}
      {data && (
        <>
          <p>
            {data.state.card.active
              ? `Карта действует до ${visitorTime(data.state.card.expiresAt!)}.`
              : 'Карта открывает больше общения и игр с персонажами.'}
          </p>
          <p>
            Сообщений сегодня: {data.state.messages.remaining}. В запасе: {data.state.messages.paid}
            .
          </p>
          <p>
            {data.settings.freeMessages} сообщений и {data.settings.freeGames} игры в день без
            карты. С картой {data.settings.cardMessages} сообщений и по {data.settings.cardGames}{' '}
            игры с каждым. Ставки в «Очко» оплачиваются отдельно.
          </p>
          <div className="visitor-products">
            {data.settings.products.map((product) => (
              <article key={product.id} className="glass visitor-product">
                <h3>
                  {product.kind === 'card'
                    ? `${data.state.card.purchased ? 'Продлить карту' : 'Карта посетителя'} на ${data.settings.cardDays} дней`
                    : `${product.amount} сообщений`}
                </h3>
                <p>
                  {product.kind === 'card'
                    ? 'Продление добавляется к оставшемуся сроку.'
                    : 'Для всех персонажей. Остаток не сгорает.'}
                </p>
                <div className="modal-actions">
                  {(['coins', 'stars'] as const).map((currency) => (
                    <button
                      key={currency}
                      className="btn btn--ghost"
                      disabled={busy || !!pending.current}
                      onClick={() => {
                        pending.current = null;
                        setSelected({ product, currency });
                        setNotice('');
                      }}
                    >
                      {product[currency].toLocaleString('ru-RU')}{' '}
                      {currency === 'coins' ? 'монет' : 'звёзд'}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {selected && (
        <div className="visitor-confirm" aria-label="Подтверждение покупки">
          <p>
            Купить «{selected.product.title}» за{' '}
            {selected.product[selected.currency].toLocaleString('ru-RU')}{' '}
            {selected.currency === 'coins' ? 'монет' : 'звёзд'}?
          </p>
          <div className="modal-actions">
            <button
              className="btn btn--cta"
              disabled={busy}
              ref={confirmation}
              onClick={() => void buy()}
            >
              {busy ? 'Покупаем…' : 'Подтвердить покупку'}
            </button>
            <button
              className="btn btn--ghost"
              disabled={busy || !!pending.current}
              onClick={() => setSelected(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {onClose && (
        <div className="modal-actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Вернуться
          </button>
        </div>
      )}
    </section>
  );
  return onClose ? (
    <AccessibleModal
      title="Стойка Игоря"
      cardClassName="visitor-shop-modal"
      closeBlocked={busy}
      headerAction={
        <button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={onClose}>
          <X size={18} />
        </button>
      }
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      {content}
    </AccessibleModal>
  ) : (
    content
  );
}
