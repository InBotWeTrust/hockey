import { describe, expect, it } from 'vitest';
import { transactionTitle } from '../../src/routes/inventory.js';

describe('inventory transaction history labels', () => {
  it('gives every supported ledger reason a meaningful title', () => {
    const reasons = [
      'admin_adjustment',
      'purchase',
      'duel_stake_hold',
      'duel_entry_fee',
      'duel_stake_refund',
      'duel_stake_payout',
      'duel_stake_burn',
      'duel_reward',
      'inventory_purchase',
      'weekly_challenge_reward',
      'bonus_game_reward',
      'tournament_entry_fee',
      'tournament_entry_refund',
      'tournament_reward',
      'achievement_reward',
      'recovery_kit_use',
    ];

    for (const reason of reasons) {
      expect(transactionTitle(reason, {}), reason).not.toMatch(/^(Операция|Другая операция)$/);
    }
  });
});
