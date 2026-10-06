import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { AmateurDuelMatchState } from '../../../api/amateurDuel.js';
import { FightControls } from './FightControls.js';
const api = vi.hoisted(() => ({ respond: vi.fn(), challenge: vi.fn() }));
const store = vi.hoisted(() => ({ applyState: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../api/amateurDuel.js', () => ({ respondAmateurFight: api.respond, challengeAmateurFight: api.challenge }));
vi.mock('../../../stores/amateurDuelStore.js', () => ({ useAmateurDuelStore: { getState: () => store } }));
const offer = (incoming = true) => ({ id: 'match', fight_enabled: true, me: { user_id: 'me' }, fight_availability: { allowed: false }, fight: { id: 'fight', status: 'offered', initiator_user_id: incoming ? 'other' : 'me', response_deadline_at: new Date(10000).toISOString() } }) as AmateurDuelMatchState;
describe('fight challenge on hockey HUD', () => {
  it('shows the challenge icon with its available label', () => {
    const match = {
      fight_enabled: true,
      fight_availability: { allowed: true, reason: 'available', remainingMs: 0 },
    } as AmateurDuelMatchState;
    render(<FightControls match={match} nowMs={0} />);
    expect(screen.getByRole('button', { name: 'Вызвать на драку' }).textContent).toBe('');
    expect(screen.getByText('ВЫЗВАТЬ')).toBeInTheDocument();
    expect(document.querySelector('.fight-challenge__pulse')).toBeNull();
  });
  it('hides the challenge after the attempt is used', () => {
    const match = {
      fight_enabled: true,
      fight_availability: { allowed: false, reason: 'attempt_used', remainingMs: 0 },
    } as AmateurDuelMatchState;
    const view = render(<FightControls match={match} nowMs={0} />);
    expect(view.container).toBeEmptyDOMElement();
  });
  it('intercepts pointer input so the challenge tap cannot also shoot', () => {
    const shoot = vi.fn();
    const match = {
      fight_enabled: true,
      fight_availability: { allowed: true, reason: 'available', remainingMs: 0 },
    } as AmateurDuelMatchState;
    render(
      <div onPointerDown={shoot}>
        <FightControls match={match} nowMs={0} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Вызвать на драку' });
    fireEvent.pointerDown(button);
    expect(shoot).not.toHaveBeenCalled();
    expect(button.parentElement).toHaveStyle({ pointerEvents: 'auto' });
  });
});

describe('inline fight offer', () => {
  it('accepts through the pulsing icon once, with a countdown and no offer window', async () => {
    api.respond.mockReturnValue(new Promise(() => undefined));
    render(<FightControls match={offer()} nowMs={500} />);
    const button = screen.getByRole('button', { name: 'Принять драку' });
    expect(button.textContent).toBe('');
    expect(button.querySelector('.fight-challenge__pulse')).not.toBeNull();
    expect(screen.getByText('ПРИНЯТЬ')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('10');
    expect(screen.queryByText('Тебя вызывают на драку')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(api.respond).toHaveBeenCalledTimes(1));
    expect(api.respond).toHaveBeenCalledWith('match', 'fight', 'accept', expect.any(String));
  });
  it('disables acceptance at the deadline', () => {
    render(<FightControls match={offer()} nowMs={10000} />);
    expect(screen.getByRole('button', { name: 'Принять драку' })).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent('0');
    expect(document.querySelector('.fight-challenge__pulse')).toBeNull();
  });
  it('shows the outgoing countdown without allowing a second challenge', () => {
    render(<FightControls match={offer(false)} nowMs={1500} />);
    expect(screen.getByRole('button', { name: 'Ждём ответа соперника' })).toBeDisabled();
    expect(screen.getByRole('timer')).toHaveTextContent('9');
    expect(screen.getByText('ЖДЁМ')).toBeInTheDocument();
    expect(document.querySelector('.fight-challenge__pulse')).toBeNull();
  });
});
