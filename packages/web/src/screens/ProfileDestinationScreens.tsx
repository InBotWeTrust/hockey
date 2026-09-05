import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { fetchHomeArenas, type HomeArenasResponse } from '../api/arenas.js';
import { fetchMyInventory, type InventoryItem, type InventoryState } from '../api/inventory.js';
import { HomeArenaModal } from '../components/HomeArenaModal.js';
import { formatProfileNumber, ProfileStatsGrid } from './profileSections.js';
import type { ProfileData } from './profileTypes.js';

function ProfilePageHeader({ title }: { title: string }): JSX.Element {
  const navigate = useNavigate();
  return (
    <header className="profile-page-header">
      <button
        type="button"
        className="icon-btn"
        aria-label="Назад"
        onClick={() => navigate('/profile')}
      >
        <ArrowLeft size={18} />
      </button>
      <h1>{title}</h1>
    </header>
  );
}

function ProfilePageStatus({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="screen profile-detail-screen profile-detail-screen--status">{children}</main>
  );
}

export function ProfileStatsScreen(): JSX.Element {
  const query = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  if (query.isLoading) return <ProfilePageStatus>Загружаем статистику…</ProfilePageStatus>;
  if (query.isError || query.data === undefined) {
    return (
      <ProfilePageStatus>
        <section className="profile-error-state" role="alert">
          <h1>Не удалось загрузить статистику</h1>
          <button type="button" className="btn btn--cta" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </section>
      </ProfilePageStatus>
    );
  }

  const { stats } = query.data;
  return (
    <main className="screen profile-detail-screen">
      <ProfilePageHeader title="Статистика" />
      <section className="profile-detail-card glass">
        <p className="profile-detail-card__eyebrow">Общий итог</p>
        <ProfileStatsGrid stats={stats} columns={2} />
      </section>
      <section className="profile-detail-card glass">
        <h2>Как считаем</h2>
        <p>
          Каждый уникальный бросок учитывается один раз — результаты турниров не дублируют
          ежедневную игру.
        </p>
      </section>
    </main>
  );
}

function equipmentLabel(kind: keyof InventoryState['equipped']): string {
  if (kind === 'stickItemId') return 'Клюшка';
  if (kind === 'skatesItemId') return 'Коньки';
  return 'Питание';
}

function equippedItem(
  inventory: InventoryState,
  kind: keyof InventoryState['equipped'],
): InventoryItem | null {
  const itemId = inventory.equipped[kind];
  if (itemId === null) return null;
  const inventoryKind =
    kind === 'stickItemId' ? 'stick' : kind === 'skatesItemId' ? 'skates' : 'nutrition';
  return (
    inventory.items[inventoryKind].find(
      (item) => item.id === itemId || item.instanceId === itemId,
    ) ?? null
  );
}

export function ProfileEquipmentScreen(): JSX.Element {
  const navigate = useNavigate();
  const query = useQuery<InventoryState>({
    queryKey: ['inventory', 'me'],
    queryFn: fetchMyInventory,
  });

  if (query.isLoading) return <ProfilePageStatus>Загружаем экипировку…</ProfilePageStatus>;
  if (query.isError || query.data === undefined) {
    return (
      <ProfilePageStatus>
        <section className="profile-error-state" role="alert">
          <h1>Не удалось загрузить экипировку</h1>
          <button type="button" className="btn btn--cta" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </section>
      </ProfilePageStatus>
    );
  }

  const slots = (Object.keys(query.data.equipped) as Array<keyof InventoryState['equipped']>).map(
    (kind) => ({
      kind,
      item: equippedItem(query.data!, kind),
    }),
  );
  return (
    <main className="screen profile-detail-screen">
      <ProfilePageHeader title="Инвентарь" />
      <section className="profile-equipment-list" aria-label="Активная экипировка">
        {slots.map(({ kind, item }) => (
          <section className="profile-equipment-group" key={kind} aria-label={equipmentLabel(kind)}>
            <div className="section-label">{equipmentLabel(kind)}</div>
            <article className="profile-equipment-slot glass">
              <div className="profile-equipment-slot__image" aria-hidden="true">
                {item?.imageUrl !== null && item?.imageUrl !== undefined ? (
                  <img src={item.imageUrl} alt="" />
                ) : null}
              </div>
              <div>
                <h2>{item?.title ?? 'Не выбрано'}</h2>
                <span>
                  {item === null
                    ? 'Выберите вещь в магазине'
                    : `Осталось: ${formatProfileNumber(item.chargesAvailable)}`}
                </span>
              </div>
            </article>
          </section>
        ))}
      </section>
      <button type="button" className="btn btn--cta" onClick={() => navigate('/inventory')}>
        Открыть магазин
      </button>
    </main>
  );
}

export function ProfileArenaScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const query = useQuery<HomeArenasResponse>({
    queryKey: ['home-arenas'],
    queryFn: fetchHomeArenas,
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  if (query.isLoading) return <ProfilePageStatus>Загружаем арены…</ProfilePageStatus>;
  if (query.isError || query.data === undefined) {
    return (
      <ProfilePageStatus>
        <section className="profile-error-state" role="alert">
          <h1>Не удалось загрузить арены</h1>
          <button type="button" className="btn btn--cta" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </section>
      </ProfilePageStatus>
    );
  }

  const { selected_arena: selectedArena, arenas } = query.data;
  return (
    <main className="screen profile-detail-screen">
      <ProfilePageHeader title="Домашняя арена" />
      <section className="profile-arena-preview glass">
        <img src={selectedArena.artwork_url} alt="" />
        <div>
          <p>Сейчас выбрана</p>
          <h2>{selectedArena.title}</h2>
        </div>
      </section>
      <button type="button" className="btn btn--cta" onClick={() => setPickerOpen(true)}>
        Выбрать площадку
      </button>
      {pickerOpen && (
        <HomeArenaModal
          arenas={arenas}
          selectedArena={selectedArena}
          onSaved={(arena) => {
            queryClient.setQueryData<HomeArenasResponse>(['home-arenas'], (current) =>
              current === undefined ? current : { ...current, selected_arena: arena },
            );
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </main>
  );
}
