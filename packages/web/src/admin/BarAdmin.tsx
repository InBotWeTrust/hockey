import { VisitorSettings } from './VisitorSettings.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  barOccupants,
  createDefaultBarLayout,
  moveBarOccupant,
  barLayoutErrors,
  type BarLayoutSnapshot,
  type BarProfile,
  type BarOccupantId,
} from '@hockey/game-core';
import { fetchAdminBarLayout, saveAdminBarLayout } from '../bar/layoutApi.js';
import { BarScene } from '../bar/BarScene.js';
import { UnsavedBarDialog } from './UnsavedBarDialog.js';
import './bar-admin.css';
export const BAR_ADMIN_DIRTY_EVENT = 'bar-admin-dirty';
const copy = (s: BarLayoutSnapshot): BarLayoutSnapshot => JSON.parse(JSON.stringify(s));
const defaults = createDefaultBarLayout();
const assetOptions = [
  ...new Set(
    Object.values(defaults.profiles)
      .flatMap((p) => [p.avatar, p.composition])
      .filter((p): p is string => !!p),
  ),
];
export function BarAdmin() {
  const [saved, setSaved] = useState<BarLayoutSnapshot | null>(null);
  const [draft, setDraft] = useState<BarLayoutSnapshot | null>(null);
  const [selected, setSelected] = useState('bar-8');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const dragged = useRef<string | null>(null);
  const [visitorDirty, setVisitorDirty] = useState(false);
  const dirty = visitorDirty || !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setNotice('');
    try {
      const value = await fetchAdminBarLayout();
      if (!mounted.current || generation !== loadGeneration.current) return;
      setSaved(copy(value));
      setDraft(copy(value));
      setSelected(value.layout.defaultSlotId);
      setConflict(false);
    } catch {
      if (mounted.current && generation === loadGeneration.current)
        setNotice('Не удалось загрузить настройки бара.');
    } finally {
      if (mounted.current && generation === loadGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadGeneration.current++;
      window.dispatchEvent(new CustomEvent(BAR_ADMIN_DIRTY_EVENT, { detail: false }));
    };
  }, [load]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(BAR_ADMIN_DIRTY_EVENT, { detail: dirty }));
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const reload = () => {
    if (dirty) setReloadOpen(true);
    else void load();
  };
  if (loading)
    return (
      <section className="bar-admin">
        <p>Загружаем расстановку…</p>
      </section>
    );
  if (!draft)
    return (
      <section className="bar-admin">
        <p role="alert">{notice}</p>
        <button className="btn" onClick={() => void load()}>
          Повторить
        </button>
      </section>
    );
  const layout = draft.layout;
  const slot = layout.slots.find((s) => s.id === selected) ?? layout.slots[0]!;
  const profile = slot.occupantId ? layout.profiles[slot.occupantId] : null;
  const errors = barLayoutErrors(layout);
  const edit = (update: (value: BarLayoutSnapshot) => BarLayoutSnapshot) => {
    if (!inFlight.current) setDraft((current) => (current ? update(current) : current));
    setNotice('');
  };
  const position = (field: 'x' | 'y' | 'scale', value: number) =>
    edit((current) => ({
      ...current,
      layout: {
        ...current.layout,
        slots: current.layout.slots.map((s) => (s.id === slot.id ? { ...s, [field]: value } : s)),
      },
    }));
  const patchProfile = (field: keyof BarProfile, value: string) => {
    if (!slot.occupantId) return;
    const id = slot.occupantId;
    edit((current) => ({
      ...current,
      layout: {
        ...current.layout,
        profiles: {
          ...current.layout.profiles,
          [id]: {
            ...current.layout.profiles[id],
            [field]: field === 'avatar' || field === 'composition' ? value || null : value,
          },
        },
      },
    }));
  };
  const reorder = (from: string, to: string) =>
    edit((current) => {
      const slots = [...current.layout.slots];
      const a = slots.findIndex((s) => s.id === from),
        b = slots.findIndex((s) => s.id === to);
      if (a < 0 || b < 0) return current;
      const [item] = slots.splice(a, 1);
      slots.splice(b, 0, item!);
      return { ...current, layout: { ...current.layout, slots } };
    });
  const save = async () => {
    if (inFlight.current || errors.length) return;
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    try {
      const value = await saveAdminBarLayout(copy(draft));
      if (!mounted.current) return;
      setSaved(copy(value));
      setDraft(copy(value));
      setConflict(false);
      setNotice('Расстановка сохранена.');
    } catch (error) {
      if (!mounted.current) return;
      const stale =
        typeof error === 'object' && error !== null && 'status' in error && error.status === 409;
      setConflict(stale);
      setNotice(
        stale
          ? 'Расстановка уже изменена другим администратором. Твои правки сохранены в редакторе.'
          : 'Не удалось сохранить. Твои правки остались в редакторе.',
      );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const index = layout.slots.findIndex((s) => s.id === slot.id);
  return (
    <section className="bar-admin">
      <VisitorSettings onDirty={setVisitorDirty} />
      {reloadOpen && (
        <UnsavedBarDialog
          title="Загрузить сохранённую расстановку?"
          discardLabel="Загрузить"
          onCancel={() => setReloadOpen(false)}
          onDiscard={() => {
            setReloadOpen(false);
            void load();
          }}
        />
      )}
      <h2>Бар «4-й период»</h2>
      <p>Расставь персонажей и объекты по страницам. Предпросмотр не меняет бар игроков.</p>
      <div className="bar-admin__layout">
        <div className="bar-admin__editor">
          <fieldset disabled={busy}>
            <label>
              Редактируемая страница
              <select value={slot.id} onChange={(e) => setSelected(e.target.value)}>
                {layout.slots.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i + 1}. {s.occupantId ? layout.profiles[s.occupantId].name : 'Свободное место'}
                  </option>
                ))}
              </select>
            </label>
            <ol className="bar-admin__pages">
              {layout.slots.map((s, i) => (
                <li
                  key={s.id}
                  draggable={!busy}
                  onDragStart={() => {
                    dragged.current = s.id;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragged.current) reorder(dragged.current, s.id);
                    dragged.current = null;
                  }}
                  onDragEnd={() => {
                    dragged.current = null;
                  }}
                >
                  <button
                    className={s.id === slot.id ? 'bar-admin__page--active' : ''}
                    onClick={() => setSelected(s.id)}
                  >
                    {i + 1}. {s.occupantId ? layout.profiles[s.occupantId].name : 'Свободное место'}
                  </button>
                </li>
              ))}
            </ol>
            <div className="bar-admin__row">
              <button
                className="btn btn--ghost"
                aria-label="Переместить страницу выше"
                disabled={index === 0}
                onClick={() => reorder(slot.id, layout.slots[index - 1]!.id)}
              >
                Выше
              </button>
              <button
                className="btn btn--ghost"
                aria-label="Переместить страницу ниже"
                disabled={index === 9}
                onClick={() => reorder(slot.id, layout.slots[index + 1]!.id)}
              >
                Ниже
              </button>
            </div>
            <label>
              Содержимое страницы
              <select
                value={slot.occupantId ?? ''}
                onChange={(e) =>
                  edit((current) => ({
                    ...current,
                    layout: moveBarOccupant(
                      current.layout,
                      slot.id,
                      (e.target.value || null) as BarOccupantId | null,
                    ),
                  }))
                }
              >
                <option value="">Свободное место</option>
                {barOccupants.map((id) => (
                  <option key={id} value={id}>
                    {layout.profiles[id].name}
                  </option>
                ))}
              </select>
            </label>
            <small>Если персонаж уже стоит на другой странице, он переместится сюда.</small>
            <label>
              Страница при входе
              <select
                value={layout.defaultSlotId}
                onChange={(e) =>
                  edit((current) => ({
                    ...current,
                    layout: { ...current.layout, defaultSlotId: e.target.value },
                  }))
                }
              >
                {layout.slots.map((s, i) => (
                  <option key={s.id} value={s.id} disabled={!s.occupantId}>
                    {i + 1}. {s.occupantId ? layout.profiles[s.occupantId].name : 'Свободное место'}
                  </option>
                ))}
              </select>
            </label>
            {profile && (
              <>
                <label>
                  Имя
                  <input
                    maxLength={80}
                    value={profile.name}
                    onChange={(e) => patchProfile('name', e.target.value)}
                  />
                </label>
                <label>
                  Должность
                  <input
                    maxLength={80}
                    value={profile.role}
                    onChange={(e) => patchProfile('role', e.target.value)}
                  />
                </label>
                <label>
                  Краткое описание
                  <textarea
                    maxLength={240}
                    rows={3}
                    value={profile.description}
                    onChange={(e) => patchProfile('description', e.target.value)}
                  />
                </label>
                <datalist id="bar-assets">
                  {assetOptions.map((path) => (
                    <option key={path} value={path} />
                  ))}
                </datalist>
                <label>
                  Аватарка
                  <input
                    list="bar-assets"
                    value={profile.avatar ?? ''}
                    placeholder="/bar/cards/avatar-v2.webp"
                    onChange={(e) => patchProfile('avatar', e.target.value)}
                  />
                </label>
                <label>
                  Изображение персонажа или объекта
                  <input
                    list="bar-assets"
                    value={profile.composition ?? ''}
                    placeholder="/bar/cards/maria-composition-v1.webp"
                    onChange={(e) => patchProfile('composition', e.target.value)}
                  />
                </label>
                {(['x', 'y', 'scale'] as const).map((field) => (
                  <label key={field}>
                    {field === 'x'
                      ? 'Положение по горизонтали'
                      : field === 'y'
                        ? 'Положение по вертикали'
                        : 'Размер'}
                    : {field === 'scale' ? Math.round(slot[field] * 100) : slot[field]}%
                    <input
                      type="range"
                      min={field === 'scale' ? 0.5 : 0}
                      max={field === 'scale' ? 1 : 100}
                      step={field === 'scale' ? 0.01 : 1}
                      value={slot[field]}
                      onChange={(e) => position(field, Number(e.target.value))}
                    />
                  </label>
                ))}
                <button
                  className="btn btn--ghost"
                  onClick={() =>
                    edit((current) => ({
                      ...current,
                      layout: {
                        ...current.layout,
                        slots: current.layout.slots.map((s) =>
                          s.id === slot.id ? { ...s, x: 50, y: 50, scale: 1 } : s,
                        ),
                      },
                    }))
                  }
                >
                  Сбросить положение
                </button>
              </>
            )}
          </fieldset>
          {errors.length > 0 && (
            <div role="alert">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <div className="bar-admin__row">
            <button
              className="btn btn--cta"
              disabled={busy || !dirty || errors.length > 0 || conflict}
              onClick={() => void save()}
            >
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button className="btn btn--ghost" disabled={busy} onClick={reload}>
              Загрузить заново
            </button>
          </div>
          {notice && <p role="status">{notice}</p>}
          {dirty && <small>Есть несохранённые изменения.</small>}
        </div>
        <div className="bar-admin__preview">
          <h3>Предпросмотр</h3>
          <BarScene
            layout={layout}
            activeSlotId={slot.id}
            onSelectSlot={setSelected}
            onAction={() => setNotice('Это предпросмотр. Игры запускаются на странице бара.')}
            preview
          />
        </div>
      </div>
    </section>
  );
}
