import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreBoard } from './ScoreBoard.js';

function expectTextOrder(text: string, parts: string[]): void {
  let lastIndex = -1;
  for (const part of parts) {
    const index = text.indexOf(part);
    expect(index).toBeGreaterThan(lastIndex);
    lastIndex = index;
  }
}

describe('ScoreBoard', () => {
  it('keeps the regular game metric order without an opponent', () => {
    const { container } = render(<ScoreBoard period={1} timer="02:10" goals={12} shots={17} />);

    expectTextOrder(container.textContent ?? '', ['ПЕРИОД', 'ВРЕМЯ', 'ШАЙБЫ', 'БРОСКИ']);
  });

  it('puts duel time before score when an opponent is present', () => {
    const { container } = render(
      <ScoreBoard
        period={1}
        periodsTotal={2}
        timer="02:10"
        goals={12}
        shots={17}
        shotsTotal={30}
        opponent={{
          name: 'Соперник',
          avatarUrl: null,
          goals: 14,
          shots: 19,
          shotsLabel: '19/30',
          time: 'играет 1/2',
          timeTone: 'active',
        }}
      />,
    );

    expectTextOrder(container.textContent ?? '', ['ПЕРИОД', 'ВРЕМЯ', 'БРОСКИ', 'СЧЁТ']);
  });
});
