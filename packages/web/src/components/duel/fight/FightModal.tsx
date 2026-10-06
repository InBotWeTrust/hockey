import type { ReactNode } from 'react';
import { AccessibleModal } from '../../AccessibleModal.js';

export function FightModal({ children }: { children: ReactNode }): JSX.Element {
  return (
    <AccessibleModal
      title="Драка"
      ariaLabel="Драка"
      closeBlocked
      cardClassName="duel-fight-card"
      backdropStyle={{ zIndex: 430 }}
    >
      {children}
    </AccessibleModal>
  );
}
