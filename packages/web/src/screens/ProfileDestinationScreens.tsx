import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/apiFetch.js';
import { fetchHomeArenas, type HomeArenasResponse } from '../api/arenas.js';
import { fetchMyInventory, type InventoryState } from '../api/inventory.js';
import { HomeArenaModal } from '../components/HomeArenaModal.js';
import { DuelLockerTab } from '../components/duel/DuelLockerTab.js';
import { ProfileStatsGrid } from './profileSections.js';
import type { ProfileData } from './profileTypes.js';
import { lockerRoomBackgroundClass } from './lockerRoomBackground.js';

function ProfilePageHeader({
  title,
  standard = false,
}: {
  title: string;
  standard?: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <header className={`profile-page-header${standard ? ' page-header-standard' : ''}`}>
      <button
        type="button"
        className={`icon-btn${standard ? ' page-header-standard__back' : ''}`}
        aria-label="Назад"
        onClick={() => navigate('/profile')}
      >
        <ArrowLeft size={18} />
      </button>
      <h1 className={standard ? 'page-header-standard__title' : undefined}>{title}</h1>
    </header>
  );
}

function ProfilePageStatus({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="screen profile-detail-screen profile-detail-screen--status">{children}</main>
  );
}

export function ProfileStoryScreen(): JSX.Element {
  const navigate = useNavigate();
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });

  if (profileQuery.isLoading) {
    return <ProfilePageStatus>Загружаем сюжет…</ProfilePageStatus>;
  }
  if (profileQuery.isError || profileQuery.data === undefined) {
    return (
      <ProfilePageStatus>
        <section className="profile-error-state" role="alert">
          <h1>Не удалось загрузить сюжет</h1>
          <button
            type="button"
            className="btn btn--cta"
            onClick={() => void profileQuery.refetch()}
          >
            Повторить
          </button>
        </section>
      </ProfilePageStatus>
    );
  }

  return (
    <main className="screen profile-detail-screen profile-story-screen">
      <ProfilePageHeader title="Сюжет" standard />
      <div className="profile-story-series-list">
        {Array.from({ length: 10 }, (_, index) => {
          const series = index + 1;
          const firstSeriesUnlocked = series === 1 && profileQuery.data.beginnerOnboardingCompleted;
          return (
            <section
              className="profile-story-series"
              key={series}
              aria-labelledby={`story-series-${series}`}
            >
              <h2
                className="section-label section-label--page profile-section-label"
                id={`story-series-${series}`}
              >
                Серия {series}
              </h2>
              {firstSeriesUnlocked ? (
                <button
                  type="button"
                  className="profile-story-series-card profile-story-series-card--unlocked glass"
                  aria-label="Открыть серию «Путь со двора»"
                  onClick={() => navigate('/profile/story/series-1')}
                >
                  <span className="profile-story-series-card__visual" aria-hidden="true">
                    <img src="/onboarding/story/scene-01-court.webp" alt="" />
                  </span>
                  <span className="profile-story-series-card__copy">
                    <strong>Путь со двора</strong>
                    <span>Последняя шайба и случайная встреча.</span>
                    <small>Просмотрено</small>
                  </span>
                </button>
              ) : (
                <article
                  className="profile-story-series-card glass"
                  aria-label={`Серия ${series}: закрыто`}
                >
                  <span className="profile-story-series-card__visual" aria-hidden="true">
                    <Lock data-testid="profile-story-series-lock" />
                  </span>
                  <span className="profile-story-series-card__copy">
                    <strong>Серия {series}</strong>
                    <small>В разработке</small>
                  </span>
                </article>
              )}
            </section>
          );
        })}
      </div>
    </main>
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

export function ProfileEquipmentScreen(): JSX.Element {
  const navigate = useNavigate();
  const [infoOpen, setInfoOpen] = useState(false);
  const profileQuery = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => apiFetch<ProfileData>('/me'),
  });
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

  return (
    <main
      className={`screen profile-detail-screen profile-detail-screen--locker mode-shell--locker ${lockerRoomBackgroundClass(profileQuery.data?.competitionLevel)}`}
    >
      <header className="bonus-games-catalog__header">
        <button
          type="button"
          className="icon-btn icon-btn--page-back catalog-header-back"
          aria-label="Назад"
          onClick={() => navigate('/profile')}
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="bonus-games-catalog__title screen-title-on-arena">Инвентарь</h1>
      </header>
      <DuelLockerTab
        onInfo={() => setInfoOpen(true)}
        onOpenInventory={() => navigate('/inventory')}
      />
      {infoOpen && (
        <div className="modal-backdrop" onClick={() => setInfoOpen(false)}>
          <section
            role="dialog"
            aria-label="Раздевалка"
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Раздевалка</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Закрыть"
                onClick={() => setInfoOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="modal-copy">
              Здесь выбирается купленный инвентарь для дуэлей: одна клюшка, одна пара коньков и одно
              питание. Если предметов нет, их можно купить в магазине.
            </p>
          </section>
        </div>
      )}
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
