import { useEffect, useState } from 'react';
import { FIGHT_FINISH_ANIMATION_MS } from '@hockey/game-core';
import { Star, TrendingUp } from 'lucide-react';
import { AccessibleModal } from '../../AccessibleModal.js';
import '../../../game/fight/fight.css';

export function FightResultModal({ won }: { won: boolean }): JSX.Element {
  // Let the fight dialog acquire its background/focus lock first, including on reconnect.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), FIGHT_FINISH_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, []);
  const title = won ? 'Вы победили' : 'Вы проиграли';
  return (
    <AccessibleModal
      open={open}
      title={title}
      ariaLabel={title}
      closeBlocked
      cardClassName="fight-result-card"
      backdropStyle={{
        zIndex: 440,
        background: 'rgba(15, 23, 42, .12)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      }}
    >
      <p className="modal-copy fight-result-rewards">
        {won && (
          <span
            className="profile-balance__amount profile-balance__amount--stars"
            role="group"
            aria-label="+1 звезда"
          >
            <Star aria-hidden="true" fill="currentColor" />
            <strong>+1</strong>
          </span>
        )}
        <span
          className="profile-balance__amount profile-balance__amount--experience"
          role="group"
          aria-label="+1 опыт"
        >
          <TrendingUp aria-hidden="true" />
          <strong>+1</strong>
        </span>
      </p>
    </AccessibleModal>
  );
}
