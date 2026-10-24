import {SectionLoading} from '../components/SectionLoading.js';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useOwnProfileSummary } from '../profile/useOwnProfileSummary.js';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/authStore.js';
import { SectionPanorama } from '../components/SectionPanorama.js';
import { DuelLockerTab } from '../components/duel/DuelLockerTab.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import './locker-room-screen.css';

const backgrounds = {
  beginner: '/backgrounds/locker-room-beginner.webp',
  amateur: '/backgrounds/locker-room-amateur.webp',
  professional: '/backgrounds/locker-room-detailed.webp',
} as const;

export function LockerRoomScreen(): JSX.Element {
  const navigate = useNavigate();
  const owner = useAuthStore((state) => state.user?.id);
  const [infoOpen, setInfoOpen] = useState(false);
  const profile = useOwnProfileSummary();
  const level = profile.data?.competitionLevel ?? 'beginner';
  const background = backgrounds[level];
  return (
    <SectionPanorama
      label="Раздевалка"
      className={`locker-room-scene${profile.data ? '' : ' locker-room-scene--pending'}`}
      pages={[{ id: 'inventory', label: 'Инвентарь', image: background }]}
      selected="inventory"
      onSelect={() => {
        /* The only page is already active. */
      }}
      panorama={background}
      storageKey={`section-scroll:${owner ?? 'guest'}:locker-room`}
      overlays={
        infoOpen ? (
          <AccessibleModal
            title="Раздевалка"
            onClose={() => setInfoOpen(false)}
            headerAction={
              <button
                type="button"
                className="icon-btn"
                aria-label="Закрыть"
                onClick={() => setInfoOpen(false)}
              >
                <X size={16} />
              </button>
            }
          >
            <p className="modal-copy">
              Здесь выбирается купленный инвентарь: одна клюшка, одна пара коньков и одно питание.
              Условия применения и расхода зависят от режима игры.
            </p>
          </AccessibleModal>
        ) : undefined
      }
    >
      <section className="locker-room-content">
        <h1 className="bonus-games-catalog__title screen-title-on-arena">Раздевалка</h1>
        {profile.isPending ? (
          <SectionLoading />
        ) : !profile.data ? (
          <section role="alert">
            <p>Не удалось загрузить раздевалку.</p>
            <button type="button" className="btn btn--cta" onClick={() => void profile.refetch()}>
              Повторить
            </button>
          </section>
        ) : (
          <DuelLockerTab
            onInfo={() => setInfoOpen(true)}
            onOpenInventory={() => navigate('/inventory')}
          />
        )}
      </section>
    </SectionPanorama>
  );
}
