import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barArmwrestling } from '@hockey/game-core';
import { ArmwrestlingField } from './ArmwrestlingField.js';
afterEach(cleanup);
it('shows both stamina values and hides touch controls before readiness', () => {
  const game = barArmwrestling.createArmwrestling(0, 1);
  const { rerender } = render(
    <ArmwrestlingField
      game={game}
      player={0}
      now={0}
      disabled={true}
      pregame={true}
      send={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Давление и кисть' })).not.toBeInTheDocument();
  rerender(
    <ArmwrestlingField
      game={game}
      player={0}
      now={0}
      disabled={false}
      pregame={false}
      send={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Давление и кисть' })).toBeInTheDocument();
  expect(screen.getAllByRole('meter')).toHaveLength(2);
});
