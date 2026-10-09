import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FightView } from './FightView.js';
import { advanceFight, createFightState, DEFAULT_FIGHT_RULES as RESPONSIVE_RULES } from '@hockey/game-core';
const DEFAULT_FIGHT_RULES = {...RESPONSIVE_RULES,version:2,initialHp:4,mainDurationMs:15000,windupMs:500,attackRecoveryMs:300};
vi.mock('../PixiStage.js', () => ({ PixiStage: () => null }));
describe('fight mobile controls', () => {
  it.each([
    ['Ударить в голову', 'attack', 'head'],
    ['Ударить в корпус', 'attack', 'body'],
    ['Блок головы', 'block', 'head'],
    ['Блок корпуса', 'block', 'body'],
  ])('%s sends its action and zone', (label, kind, zone) => {
    const act = vi.fn();
    const state = createFightState(DEFAULT_FIGHT_RULES, 0);
    const view = render(<FightView state={state} player={0} nowMs={1000} onAction={act} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(act).toHaveBeenLastCalledWith(kind, zone);
    view.unmount();
  });
  it('places four shot-style text controls below the scene', () => {
    render(
      <FightView
        state={createFightState(DEFAULT_FIGHT_RULES, 0)}
        player={0}
        nowMs={1000}
        onAction={() => {}}
      />,
    );
    expect(screen.queryByText('Твой игрок: блок · Соперник: удар')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('btn', 'btn--cta');
      expect(button.closest('.fight-arena')).toBeNull();
      expect(button.closest('.fight-actions')).not.toBeNull();
      expect(button.textContent).not.toBe('');
    }
    expect(screen.getByLabelText('Ты: 4 HP')).toBeInTheDocument();
    expect(screen.getByLabelText('Соперник: 4 HP')).toBeInTheDocument();
  });
  it('keeps the current player and opponent identities aligned with their HP on either side', () => {
    const state = createFightState(DEFAULT_FIGHT_RULES, 0);
    state.hp = [1, 2];
    render(
      <FightView
        state={state}
        player={1}
        nowMs={1000}
        onAction={() => {}}
        currentPlayer={{ name: 'Александр', avatarUrl: '/current-avatar.webp' }}
        opponent={{ name: 'Михаил', avatarUrl: '/opponent-avatar.webp' }}
      />,
    );
    expect(screen.getByLabelText('Ты: 2 HP')).toHaveTextContent('Александр');
    expect(screen.getByLabelText('Соперник: 1 HP')).toHaveTextContent('Михаил');
    expect(screen.getByAltText('Аватар текущего игрока')).toHaveAttribute(
      'src',
      '/current-avatar.webp',
    );
    expect(screen.getByAltText('Аватар соперника')).toHaveAttribute('src', '/opponent-avatar.webp');
    expect(screen.getByRole('timer')).toHaveTextContent('Время14');
  });
  it.each([false, true])(
    'shows both contact reactions for a confirmed attack (blocked=%s)',
    (blocked) => {
      const initial = createFightState(DEFAULT_FIGHT_RULES, 0);
      const props = { player: 0 as const, onAction: () => {} };
      const view = render(<FightView {...props} state={initial} nowMs={1000} />);
      const command = {
        player: 0 as const,
        kind: 'attack' as const,
        zone: 'head' as const,
        seq: 1,
        phaseId: 0,
        effectiveAtMs: 1000,
      };
      const state = advanceFight(
        initial,
        blocked ? [command, { ...command, player: 1, kind: 'block' }] : [command],
        1600,
      ).state;
      view.rerender(<FightView {...props} state={state} nowMs={1600} />);
      expect(
        view.container.querySelector(`[data-feedback="${blocked ? 'blocked' : 'strike'}"]`),
      ).not.toBeNull();
      expect(
        view.container.querySelector(`[data-feedback="${blocked ? 'guard' : 'hit'}"]`),
      ).not.toBeNull();
      view.rerender(<FightView {...props} state={state} nowMs={2200} />);
      expect(view.container.querySelector('[data-feedback]')).toBeNull();
    },
  );
  it('clears predicted recovery when the server rejects input or changes phase', () => {
    const state = createFightState(DEFAULT_FIGHT_RULES, 0);
    const action = vi.fn(() => true);
    const view = render(<FightView state={state} player={0} nowMs={1000} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ударить в голову' }));
    const rejected = { ...state, lastSeq: [1, 0] as [number, number] };
    view.rerender(
      <FightView state={rejected} player={0} nowMs={1050} onAction={action} predictionReset={1} />,
    );
    expect(screen.getByRole('button', { name: 'Блок корпуса' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Блок корпуса' }));
    view.rerender(
      <FightView
        state={{ ...rejected, phaseId: 1 }}
        player={0}
        nowMs={1100}
        onAction={action}
        predictionReset={1}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ударить в голову' })).not.toBeDisabled();
  });
  it('disables input before shared start and during recovery', () => {
    const state = createFightState(DEFAULT_FIGHT_RULES, 1000);
    const { rerender } = render(
      <FightView state={state} player={0} nowMs={500} onAction={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Ударить в голову' })).toBeDisabled();
    state.actions.push({
      player: 0,
      phaseId: 0,
      seq: 1,
      kind: 'attack',
      zone: 'head',
      effectiveAtMs: 1000,
      activeAtMs: 1150,
      activeUntilMs: 1350,
      busyUntilMs: 1750,
      resolved: false,
    });
    rerender(<FightView state={state} player={0} nowMs={1500} onAction={() => {}} />);
    expect(screen.getByRole('button', { name: 'Блок корпуса' })).toBeDisabled();
  });
});

it('disables all fight inputs after the confirmed result', () => {
  const state = createFightState(DEFAULT_FIGHT_RULES, 0);
  state.status = 'resolved';
  state.winner = 0;
  state.hp = [2, 0];
  const action = vi.fn();
  render(<FightView state={state} player={0} nowMs={1000} onAction={action} />);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(action).not.toHaveBeenCalled();
});

it('keeps recovery locked when a movement acknowledgement advances the sequence', () => {
  const state = createFightState(DEFAULT_FIGHT_RULES, 0);
  const props = { player: 0 as const, onAction: vi.fn(() => true), onMove: vi.fn(() => true) };
  const view = render(<FightView {...props} state={state} nowMs={1000} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ударить в голову' }));
  view.rerender(<FightView {...props} state={{ ...state, lastSeq: [1, 0] }} nowMs={1100} />);
  expect(screen.getByRole('button', { name: 'Ударить в голову' })).toBeDisabled();
});
it('starts and stops movement on pointer down/up and stops on lost focus', () => {
  const move = vi.fn(() => true);
  render(
    <FightView
      state={createFightState(DEFAULT_FIGHT_RULES, 0)}
      player={0}
      nowMs={1000}
      onAction={() => {}}
      onMove={move}
    />,
  );
  const forward = screen.getByRole('button', { name: 'Двигаться вперёд' });
  fireEvent.pointerDown(forward, { pointerId: 1 });
  expect(move).toHaveBeenLastCalledWith(1);
  fireEvent.pointerUp(forward, { pointerId: 1 });
  expect(move).toHaveBeenLastCalledWith(0);
  fireEvent.pointerDown(forward, { pointerId: 2 });
  fireEvent(window, new Event('blur'));
  expect(move).toHaveBeenLastCalledWith(0);
});
