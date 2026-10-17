import { X } from 'lucide-react';
import { useState } from 'react';
import type { VisitorState } from '@hockey/game-core';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { visitorTime, useVisitor } from './visitorApi.js';
import './visitor-card.css';
export const VISITOR_CARD_ART = '/bar/visitor-card-v1.webp';
export function VisitorCardSlot({ card }: { card?: VisitorState['card'] }) {
  const [open, setOpen] = useState(false);
  const visitor = useVisitor(!!card?.purchased);
  card = visitor.data?.state.card ?? card;
  if (!card?.purchased) return null;
  return (
    <>
      <button
        type="button"
        className={`profile-loadout-slot visitor-card-slot${card.active ? '' : ' visitor-card-slot--expired'}`}
        disabled={!card.active}
        aria-label={`Карта посетителя${card.active ? '' : ': срок истёк'}`}
        onClick={() => setOpen(true)}
      >
        <span className="profile-loadout-slot__image">
          <img src={VISITOR_CARD_ART} alt="Карта посетителя 4-го периода" />
        </span>
        <span className="profile-loadout-slot__kind">Барная карта</span>
        <span className="profile-loadout-slot__title">
          {card.active ? 'Активна' : 'Срок истёк'}
        </span>
      </button>
      {open && card.active && (
        <AccessibleModal
          title="Карта посетителя"
          headerAction={
            <button className="icon-btn" aria-label="Закрыть" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          }
          onRequestClose={() => setOpen(false)}
        >
          <img className="visitor-card-art" src={VISITOR_CARD_ART} alt="Карта посетителя" />
          <p className="modal-copy">
            Действует до {card.expiresAt ? visitorTime(card.expiresAt) : ''}.
          </p>
          <p className="modal-copy">
            {visitor.data
              ? `${visitor.data.settings.cardMessages} сообщений в день и по ${visitor.data.settings.cardGames} игры с каждым персонажем.`
              : 'Больше ежедневных сообщений и игр с персонажами.'}{' '}
            Карта действует автоматически.
          </p>
          <div className="modal-actions">
            <button className="btn btn--ghost" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </AccessibleModal>
      )}
    </>
  );
}
