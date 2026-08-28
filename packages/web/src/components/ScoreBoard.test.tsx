import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildGameScoreboardModel, GameScoreboard, ScoreBoard } from './ScoreBoard.js';

function expectTextOrder(text: string, parts: string[]): void {
  let lastIndex = -1;
  for (const part of parts) {
    const index = text.indexOf(part);
    expect(index).toBeGreaterThan(lastIndex);
    lastIndex = index;
  }
}

describe('ScoreBoard', () => {
  it('renders configurable rows with their own metric counts and a notice', () => {
    render(
      <GameScoreboard
        rows={[
          {
            id: 'summary',
            metrics: [
              { id: 'period', label: 'ПЕРИОД', value: '2/3', emphasis: 'small' },
              { id: 'timer', label: 'ПЕРЕРЫВ', value: '14:59', tone: 'timer' },
              { id: 'goals', label: 'ГОЛЫ', value: '18' },
            ],
          },
          {
            id: 'opponent',
            variant: 'secondary',
            metrics: [
              { id: 'opponent-shots', label: 'СОПЕРНИК', value: '19/30' },
              { id: 'opponent-status', label: 'СТАТУС', value: 'ИГРАЕТ 1/2' },
            ],
          },
        ]}
        statusLine={{
          id: 'opponent',
          label: 'Соперник',
          value: '19/30 · играет 1/2',
          avatarUrl: null,
          tone: 'active',
        }}
        notice="Нужно восстановиться"
      />,
    );

    expect(screen.getByLabelText('Игровое табло')).toHaveClass('game-scoreboard');
    expect(screen.getByTestId('scoreboard-row-summary')).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    });
    expect(screen.getByTestId('scoreboard-row-opponent')).toHaveClass(
      'game-scoreboard__row--secondary',
    );
    expect(screen.getByText('14:59').closest('.game-scoreboard__metric')).toHaveClass(
      'game-scoreboard__metric--timer',
    );
    expect(screen.getByLabelText('Соперник: Соперник')).toHaveTextContent(
      'Соперник19/30 · играет 1/2',
    );
    expect(screen.getByText('Нужно восстановиться')).toHaveClass('game-scoreboard__notice');
  });

  it('puts all single-period metrics in one compact row with time last', () => {
    const model = buildGameScoreboardModel({
      period: 1,
      periodsTotal: 1,
      timer: '50',
      timerLabel: 'ЛИМИТ',
      goals: 7,
      shots: 18,
      shotsTotal: 50,
    });

    expect(model.rows).toEqual([
      {
        id: 'summary',
        metrics: [
          { id: 'period', label: 'ПЕРИОД', value: '1/1' },
          { id: 'goals', label: 'ГОЛЫ', value: '07' },
          { id: 'shots', label: 'БРОСКИ', value: '18/50' },
          { id: 'timer', label: 'ЛИМИТ', value: '50', tone: 'timer' },
        ],
      },
    ]);
    expect(model.notice).toBeUndefined();
  });

  it('uses compact typography for a long countdown in every game mode', () => {
    render(
      <ScoreBoard
        period={3}
        timer="23:59:59"
        timerLabel="ДО ОБНОВЛЕНИЯ"
        goals={78}
        shots={90}
        shotsTotal={90}
      />,
    );

    expect(screen.getByText('23:59:59').closest('.game-scoreboard__metric')).toHaveClass(
      'game-scoreboard__metric--small',
    );
  });

  it('builds the existing duel order and opponent status notice', () => {
    const model = buildGameScoreboardModel({
      period: 1,
      periodsTotal: 2,
      timer: '02:10',
      timerLabel: 'ВРЕМЯ',
      goals: 12,
      shots: 17,
      shotsTotal: 30,
      opponent: {
        name: 'Соперник',
        avatarUrl: null,
        goals: 14,
        shots: 19,
        shotsLabel: '19/30',
        time: 'играет 1/2',
        timeTone: 'active',
      },
    });

    expect(model.rows[0]?.metrics.map(({ label, value }) => [label, value])).toEqual([
      ['ПЕРИОД', '1/2'],
      ['СЧЁТ', '12:14'],
      ['БРОСКИ', '17/30'],
      ['ВРЕМЯ', '02:10'],
    ]);
    expect(model.statusLine).toEqual({
      id: 'opponent',
      label: 'Соперник',
      value: '19/30 · ИГРАЕТ 1/2',
      avatarUrl: null,
      tone: 'active',
    });
    expect(model.notice).toBeUndefined();
  });

  it('keeps the regular game metric order without an opponent', () => {
    const { container } = render(<ScoreBoard period={1} timer="02:10" goals={12} shots={17} />);

    expectTextOrder(container.textContent ?? '', ['ПЕРИОД', 'ШАЙБЫ', 'БРОСКИ', 'ВРЕМЯ']);
  });

  it('puts duel time after score and shots when an opponent is present', () => {
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

    expectTextOrder(container.textContent ?? '', ['ПЕРИОД', 'СЧЁТ', 'БРОСКИ', 'ВРЕМЯ']);
  });
});
