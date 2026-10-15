import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { barDarts } from '@hockey/game-core';
import { DartsField } from './GameFields.js';
afterEach(cleanup);
it('shows contact feedback only after landing and clears it after impact', () => {
  const props = {
    game: barDarts.create(0),
    lastDart: { x: 0, y: -0.6 },
    animationStart: 1000,
    disabled: true,
    send: vi.fn(),
  };
  const { container, rerender } = render(<DartsField {...props} now={1600} />);
  expect(container.querySelector('.bar-dart-contact')).toBeNull();
  rerender(<DartsField {...props} now={1750} />);
  expect(container.querySelector('.bar-dart-contact')).not.toBeNull();
  expect(container.querySelector('.bar-dartboard--impact')).not.toBeNull();
  rerender(<DartsField {...props} now={2100} />);
  expect(container.querySelector('.bar-dart-contact')).toBeNull();
});
it('does not show a target impact on a miss', () => {
  const { container } = render(
    <DartsField
      game={barDarts.create(0)}
      lastDart={{ x: 0, y: -1.2 }}
      animationStart={1000}
      now={1750}
      disabled={true}
      send={vi.fn()}
    />,
  );
  expect(container.querySelector('.bar-dart-contact')).toBeNull();
  expect(container.querySelector('.bar-dartboard--impact')).toBeNull();
});
