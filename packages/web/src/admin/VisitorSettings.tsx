import { useEffect, useRef, useState } from 'react';
import type { VisitorSettings as Settings } from '@hockey/game-core';
import { apiFetch } from '../api/apiFetch.js';
import { visitorChanged } from '../bar/visitorApi.js';
import '../bar/visitor-card.css';
export function VisitorSettings({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState<{ revision: number; settings: Settings } | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const load = async () => {
    try {
      const value = await apiFetch<{ revision: number; settings: Settings }>('/admin/bar/visitor');
      if (alive.current) {
        setDraft(value);
        setSaved(JSON.stringify(value));
      }
    } catch {
      if (alive.current) setNotice('Не удалось загрузить экономику бара.');
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onDirty?.(!!draft && JSON.stringify(draft) !== saved);
  }, [draft, saved, onDirty]);
  const labels = {
    cardDays: 'Срок карты, дней',
    freeMessages: 'Сообщения без карты в день',
    cardMessages: 'Сообщения с картой в день',
    freeGames: 'Игры без карты в день',
    cardGames: 'Игры с картой с каждым в день',
  } as const;
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const value = await apiFetch<typeof draft>('/admin/bar/visitor', {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      if (alive.current) {
        setDraft(value);
        setSaved(JSON.stringify(value));
        setNotice('Экономика бара сохранена.');
        visitorChanged();
      }
    } catch (error) {
      if (alive.current)
        setNotice(error instanceof Error ? error.message : 'Не удалось сохранить.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section className="visitor-settings glass" aria-label="Экономика бара">
      <h2>Карта и лимиты</h2>
      {draft ? (
        <>
          {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
            <label key={key}>
              {labels[key]}
              <input
                type="number"
                min="1"
                value={draft.settings[key]}
                disabled={busy}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    settings: { ...draft.settings, [key]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          {draft.settings.products.map((product, index) => (
            <fieldset key={product.id}>
              <legend>{product.title}</legend>
              {(
                [
                  'coins',
                  'stars',
                  ...(product.kind === 'messages' ? (['amount'] as const) : []),
                ] as const
              ).map((key) => (
                <label key={key}>
                  {key === 'coins'
                    ? 'Цена в монетах'
                    : key === 'stars'
                      ? 'Цена в звёздах'
                      : 'Сообщений в пакете'}
                  <input
                    type="number"
                    min="1"
                    value={product[key]}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        settings: {
                          ...draft.settings,
                          products: draft.settings.products.map((p, i) =>
                            i === index ? { ...p, [key]: Number(e.target.value) } : p,
                          ),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <div className="modal-actions">
            <button className="btn btn--cta" disabled={busy} onClick={() => void save()}>
              Сохранить экономику
            </button>
            <button className="btn btn--ghost" disabled={busy} onClick={() => void load()}>
              Обновить
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn--ghost" onClick={() => void load()}>
          Загрузить настройки
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
