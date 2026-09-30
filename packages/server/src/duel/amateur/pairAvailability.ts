export type PairBlockReason = 'daily' | 'weekly' | 'monthly' | 'format' | 'open_slots' | 'outgoing';

type Capacity = { reason: 'daily' | 'weekly' | 'monthly' | 'format' | null; retryAt: Date | null };

export function pairAvailability(
  self: Capacity,
  opponent: Capacity,
  selfOpen: number,
  opponentOpen: number,
  outgoing: number,
  maxOpen: number,
  maxOutgoing = 2,
): { available: boolean; reason: PairBlockReason | null; player: 'self' | 'opponent' | null; retryAt: Date | null } {
  const blocked = self.reason ? { reason: self.reason, player: 'self' as const, retryAt: self.retryAt }
    : opponent.reason ? { reason: opponent.reason, player: 'opponent' as const, retryAt: opponent.retryAt }
      : selfOpen >= maxOpen ? { reason: 'open_slots' as const, player: 'self' as const, retryAt: null }
        : opponentOpen >= maxOpen ? { reason: 'open_slots' as const, player: 'opponent' as const, retryAt: null }
          : outgoing >= maxOutgoing ? { reason: 'outgoing' as const, player: 'self' as const, retryAt: null }
            : null;
  return { available: blocked === null, reason: blocked?.reason ?? null,
    player: blocked?.player ?? null, retryAt: blocked?.retryAt ?? null };
}
