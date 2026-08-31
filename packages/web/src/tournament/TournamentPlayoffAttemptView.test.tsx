import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TournamentFixtureAttemptState } from '../api/tournament.js';
import { TournamentPlayoffAttemptView } from './TournamentPlayoffBracket.js';

function attemptState(
  patch: Partial<TournamentFixtureAttemptState> = {},
): TournamentFixtureAttemptState {
  return {
    attempt: {
      id: 'attempt-1',
      number: 1,
      kind: 'initial',
      status: 'ready_check',
      scheduledStart: '2030-09-10T12:00:00.000Z',
      readinessExpiresAt: '2030-09-10T12:05:00.000Z',
      hardDeadlineAt: '2030-09-10T13:00:00.000Z',
      myReady: false,
      opponentReady: false,
      duelMatchId: 'duel-1',
      result: null,
      incidentType: null,
    },
    opponentProgress: null,
    series: {
      id: 'series-1',
      winsRequired: 4,
      myWins: 1,
      opponentWins: 0,
      higherSeedWins: 1,
      lowerSeedWins: 0,
      higherSeedUserId: 'u1',
      lowerSeedUserId: 'u2',
      status: 'active',
      winnerUserId: null,
    },
    tournament: { status: 'playoff', winnerUserId: null },
    nextGameChoice: null,
    ...patch,
  };
}

describe('TournamentPlayoffAttemptView', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows live readiness and opponent period countdowns', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-09-10T12:00:30.000Z'));
    const { rerender } = render(
      <TournamentPlayoffAttemptView
        state={attemptState()}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('До закрытия готовности 04:30')).toBeInTheDocument();

    rerender(
      <TournamentPlayoffAttemptView
        state={attemptState({
          attempt: { ...attemptState().attempt, status: 'active', myReady: true },
          opponentProgress: {
            state: 'period_active',
            currentPeriod: 2,
            periodEndsAt: '2030-09-10T12:05:30.000Z',
          },
        })}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('До конца периода соперника 05:00')).toBeInTheDocument();
  });

  it('opens the duel from the readiness state with a human five-minute explanation', () => {
    const onOpenGame = vi.fn();
    render(
      <TournamentPlayoffAttemptView
        state={attemptState()}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={onOpenGame}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Подтвердите готовность в течение 5 минут')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить готовность' }));
    expect(onOpenGame).toHaveBeenCalledTimes(1);
  });

  it('shows the opponent period while the game is running without revealing their score', () => {
    render(
      <TournamentPlayoffAttemptView
        state={attemptState({
          attempt: { ...attemptState().attempt, status: 'active', myReady: true, opponentReady: true },
          opponentProgress: {
            state: 'period_active',
            currentPeriod: 2,
            periodEndsAt: '2030-09-10T12:20:00.000Z',
          },
        })}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Соперник играет 2-й период')).toBeInTheDocument();
    expect(screen.getByText('Дождитесь завершения игры соперника')).toBeInTheDocument();
    expect(screen.queryByText(/шайб/i)).not.toBeInTheDocument();
  });

  it('shows a technical result and never offers to reopen a finished game', () => {
    render(
      <TournamentPlayoffAttemptView
        state={attemptState({
          attempt: {
            ...attemptState().attempt,
            status: 'technical_result',
            myReady: true,
            result: {
              outcome: 'away_no_show',
              winnerUserId: 'u1',
              myScore: 0,
              opponentScore: 0,
              myAccuracy: null,
              opponentAccuracy: null,
              myActiveTimeMs: null,
              opponentActiveTimeMs: null,
            },
          },
        })}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Техническая победа')).toBeInTheDocument();
    expect(screen.getByText(/соперник не подтвердил готовность/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /игр/i })).not.toBeInTheDocument();
  });

  it('explains that an administrator must assign a new time', () => {
    render(
      <TournamentPlayoffAttemptView
        state={attemptState({
          attempt: {
            ...attemptState().attempt,
            status: 'needs_reschedule',
            result: {
              outcome: 'both_no_show',
              winnerUserId: null,
              myScore: null,
              opponentScore: null,
              myAccuracy: null,
              opponentAccuracy: null,
              myActiveTimeMs: null,
              opponentActiveTimeMs: null,
            },
            incidentType: 'both_no_show',
          },
        })}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Нужно новое время')).toBeInTheDocument();
    expect(screen.getByText(/администратор назначит новую дату и время/i)).toBeInTheDocument();
  });

  it('offers the one-minute next-game choice and records the selected option', () => {
    const onChooseNextGame = vi.fn();
    render(
      <TournamentPlayoffAttemptView
        state={attemptState({
          attempt: {
            ...attemptState().attempt,
            status: 'settled',
            myReady: true,
            opponentReady: true,
            result: {
              outcome: 'home_win',
              winnerUserId: 'u1',
              myScore: 4,
              opponentScore: 2,
              myAccuracy: 62.5,
              opponentAccuracy: 48.25,
              myActiveTimeMs: 80_000,
              opponentActiveTimeMs: 95_000,
            },
          },
          nextGameChoice: {
            nextFixtureId: 'fixture-2',
            expiresAt: '2030-09-10T12:31:00.000Z',
            myChoice: null,
            opponentChoice: null,
            canChoose: true,
            startsImmediately: false,
          },
        })}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={onChooseNextGame}
      />,
    );

    expect(screen.getByText('Победа в игре · 4:2')).toBeInTheDocument();
    expect(screen.getByText(/в течение минуты выберите/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сыграть сразу' }));
    expect(onChooseNextGame).toHaveBeenCalledWith('immediate');
    fireEvent.click(screen.getByRole('button', { name: 'По расписанию' }));
    expect(onChooseNextGame).toHaveBeenCalledWith('scheduled');
  });

  it('celebrates a series victory and a tournament victory distinctly', () => {
    const state = attemptState({
      attempt: {
        ...attemptState().attempt,
        status: 'settled',
        result: {
          outcome: 'home_win',
          winnerUserId: 'u1',
          myScore: 3,
          opponentScore: 1,
          myAccuracy: 55,
          opponentAccuracy: 42,
          myActiveTimeMs: 60_000,
          opponentActiveTimeMs: 70_000,
        },
      },
      series: {
        ...attemptState().series!,
        myWins: 4,
        higherSeedWins: 4,
        status: 'completed',
        winnerUserId: 'u1',
      },
      tournament: { status: 'completed', winnerUserId: 'u1' },
    });
    render(
      <TournamentPlayoffAttemptView
        state={state}
        currentUserId="u1"
        timezone="Europe/Moscow"
        onOpenGame={vi.fn()}
        onChooseNextGame={vi.fn()}
      />,
    );

    expect(screen.getByText('Вы выиграли серию 4 : 0')).toBeInTheDocument();
    expect(screen.getByText('Вы — победитель турнира')).toBeInTheDocument();
  });
});
