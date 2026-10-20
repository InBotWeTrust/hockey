import type { ReactNode } from 'react';
import { FIGHT_MEDICAL_AID_MS } from '@hockey/game-core';
import { AccessibleModal } from '../../AccessibleModal.js';

export function FightModal({ children, medicalAidUntilMs, nowMs = 0 }: {
  children?: ReactNode;
  medicalAidUntilMs?: number;
  nowMs?: number;
}): JSX.Element {
  const medicalAid = medicalAidUntilMs !== undefined;
  const title = medicalAid ? 'Оказание помощи' : 'Драка';
  return (
    <AccessibleModal
      title={title}
      ariaLabel={title}
      closeBlocked
      cardClassName={medicalAid ? 'fight-medical-card' : 'duel-fight-card'}
      backdropStyle={{ zIndex: 430 }}
    >
      {medicalAid ? (
        <figure className="fight-medical-art">
          <img src="/sprites/fight/medical-aid-v1.webp" alt="Доктор оказывает помощь хоккеисту" width={640} height={640} draggable={false} />
          <span className="fight-medical-timer game-scoreboard" role="timer" aria-label="До возвращения в игру">
            <span className="game-scoreboard__metric--timer"><strong className="game-scoreboard__value">
              {Math.max(0,Math.min(FIGHT_MEDICAL_AID_MS/1000,Math.ceil((medicalAidUntilMs-nowMs)/1000)))}
            </strong></span>
          </span>
        </figure>
      ) : children}
    </AccessibleModal>
  );
}
