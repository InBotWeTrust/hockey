import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DestinationIntroductionGate, destinationForLocation } from './DestinationIntroductionGate.js';

vi.mock('./DestinationIntroduction.js', () => ({
  DestinationIntroduction: ({ destination }: { destination: string }) => (
    <div data-testid="destination-introduction">{destination}</div>
  ),
}));

function NavigationControls(): JSX.Element {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/daily')}>На ежедневку</button>
      <button type="button" onClick={() => navigate('/')}>Домой</button>
    </>
  );
}

function renderGate(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <NavigationControls />
      <DestinationIntroductionGate />
    </MemoryRouter>,
  );
}

describe('destinationForLocation', () => {
  it.each([
    ['/', '', 'main'],
    ['/daily', '', 'daily'],
    ['/sections', '', 'sections'],
    ['/', '?view=training', 'training'],
    ['/achievements', '', 'tasks'],
    ['/inventory', '', 'shop'],
    ['/bonus-games', '', 'bonus-games'],
    ['/', '?view=amateur', 'amateur'],
    ['/chat', '', 'chat'],
    ['/profile', '', 'profile-main'],
  ] as const)('maps %s%s to %s', (pathname, search, destination) => {
    expect(destinationForLocation(pathname, search)).toBe(destination);
  });

  it('does not introduce the professional section yet', () => {
    expect(destinationForLocation('/', '?view=pro')).toBeNull();
  });

  it.each([
    '/profile/stats',
    '/profile/equipment',
    '/profile/arena',
    '/profile/story',
    '/profile/achievements',
    '/profile/settings',
  ])('does not show another introduction inside profile at %s', (pathname) => {
    expect(destinationForLocation(pathname, '')).toBeNull();
  });
});

describe('DestinationIntroductionGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows the main introduction after the same short pause as other destinations', () => {
    renderGate();

    act(() => vi.advanceTimersByTime(1_199));
    expect(screen.queryByTestId('destination-introduction')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('destination-introduction')).toHaveTextContent('main');
  });

  it('restarts the short pause when the user returns to the main screen', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'На ежедневку' }));
    act(() => vi.advanceTimersByTime(1_200));
    expect(screen.getByTestId('destination-introduction')).toHaveTextContent('daily');
    fireEvent.click(screen.getByRole('button', { name: 'Домой' }));
    expect(screen.queryByTestId('destination-introduction')).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_199));
    expect(screen.queryByTestId('destination-introduction')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('destination-introduction')).toHaveTextContent('main');
  });

  it('uses the short pause for other destinations too', () => {
    renderGate();
    fireEvent.click(screen.getByRole('button', { name: 'На ежедневку' }));

    expect(screen.queryByTestId('destination-introduction')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_200));
    expect(screen.getByTestId('destination-introduction')).toHaveTextContent('daily');
  });
});
