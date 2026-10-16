import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barArmwrestling } from '@hockey/game-core';
import { ArmwrestlingField } from './ArmwrestlingField.js';
afterEach(cleanup);
it('hides touch controls before readiness and shows the struggle meter', () => {
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
  expect(screen.getAllByRole('meter')).toHaveLength(1);
  expect(screen.getByRole('meter', {name: 'Ход борьбы'})).toBeInTheDocument();
});
it('keeps the controls footprint at the end so the static scene cannot expand', () => {
 const game = barArmwrestling.createArmwrestling(0, 1);
 const {container,rerender}=render(<ArmwrestlingField game={game} player={0} now={1000} disabled={false} pregame={false} send={vi.fn()}/>);
 const controls=container.querySelector('.bar-arm-controls');
 rerender(<ArmwrestlingField game={{...game,winner:1}} player={0} now={1100} disabled={false} pregame={false} send={vi.fn()}/>);
 expect(container.querySelector('.bar-arm-controls')).toBe(controls);
 expect(screen.getByRole('button',{name:'Давление и кисть'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Опора свободной руки'})).toBeDisabled();
});
it('shows disabled controls until the scheduled start', () => {
 const game=barArmwrestling.createArmwrestling(3000,1);
 const {rerender}=render(<ArmwrestlingField game={game} player={0} now={2000} disabled={false} pregame={false} send={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'Опора свободной руки'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Давление и кисть'})).toBeDisabled();
 rerender(<ArmwrestlingField game={game} player={0} now={3000} disabled={false} pregame={false} send={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'Давление и кисть'})).toBeEnabled();
});
