import { useEffect, useRef, useState } from 'react';
import type { BarGameSnapshot } from '@hockey/game-core';
import { ApiError } from '../../api/apiFetch.js';
import { queryClient } from '../../app/queryClient.js';
import { formatRussianCount } from '../../lib/russianPlural.js';
import { gameApi } from './api.js';
export function OchkoStake({ onStarted }: { onStarted: (view: BarGameSnapshot) => void }) {
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof gameApi.ochkoOffer>> | null>(null),
    [amount, setAmount] = useState(''),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [uncertain, setUncertain] = useState(false);
  const lock = useRef(false),
    pending = useRef<{ requestId: string; offerId: string; stars: number } | null>(null);
  useEffect(() => {
    let live = true;
    void gameApi
      .ochkoOffer()
      .then((o) => {
        if (live) {
          setOffer(o);
          setAmount(String(o.stars));
          setError(null);
        }
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : 'Не удалось получить ставку.');
      });
    return () => {
      live = false;
    };
  }, [retry]);
  const stars = Number(amount),
    valid = !!offer && Number.isSafeInteger(stars) && stars >= 1 && stars <= offer.balance;
  const start = async () => {
    if (lock.current || !offer || (!valid && !pending.current)) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const input = pending.current ?? {
      requestId: crypto.randomUUID(),
      offerId: offer.offerId,
      stars,
    };
    pending.current = input;
    try {
      const result = await gameApi.startOchkoStake(input);
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onStarted(result);
      pending.current = null;
      setUncertain(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подтвердить ставку. Повтори отправку.');
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="bar-ochko-stake">
      {offer && (
        <>
          <p className="modal-copy">
            Григорий предлагает {formatRussianCount(offer.stars, 'звезду', 'звезды', 'звёзд')}. Твой
            баланс: {formatRussianCount(offer.balance, 'звезда', 'звезды', 'звёзд')}.
          </p>
          <label>
            Твоя ставка
            <input
              aria-label="Ставка в звёздах"
              type="number"
              inputMode="numeric"
              min="1"
              max={offer.balance}
              step="1"
              value={amount}
              disabled={busy || uncertain}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {!valid && <p className="modal-copy">Укажи целое число от 1 до {offer.balance}.</p>}
        </>
      )}
      {error && (
        <p role="alert" className="modal-copy">
          {error}
        </p>
      )}
      <div className="modal-actions">
        {error && !uncertain && (
          <button className="btn btn--ghost" disabled={busy} onClick={() => setRetry((n) => n + 1)}>
            Обновить предложение
          </button>
        )}
        <button
          className="modal-primary btn btn--cta"
          disabled={busy || (!valid && !uncertain)}
          onClick={() => void start()}
        >
          {busy
            ? 'Начинаем…'
            : uncertain
              ? 'Повторить отправку'
              : `Играть на ${valid ? formatRussianCount(stars, 'звезду', 'звезды', 'звёзд') : '…'}`}
        </button>
      </div>
    </div>
  );
}
