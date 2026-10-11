import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BarAccessGate } from './BarAccessGate.js';
import { fetchBarAccess } from './olegFightApi.js';
vi.mock('./olegFightApi.js', () => ({ fetchBarAccess: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
});
it('does not mount bar contents while access is blocked or being checked', async () => {
  vi.mocked(fetchBarAccess).mockResolvedValue({
    blockedUntil: '2026-10-12T00:00:00Z',
    fightId: null,
  });
  render(
    <MemoryRouter>
      <BarAccessGate>
        <p>Private bar contents</p>
      </BarAccessGate>
    </MemoryRouter>,
  );
  expect(screen.queryByText('Private bar contents')).not.toBeInTheDocument();
  expect(await screen.findByText('«4-й период» закрыт для тебя')).toBeInTheDocument();
  expect(screen.queryByText('Private bar contents')).not.toBeInTheDocument();
});
it('allows bar entry only after a successful server check', async () => {
  vi.mocked(fetchBarAccess).mockResolvedValue({ blockedUntil: null, fightId: null });
  render(
    <MemoryRouter>
      <BarAccessGate>
        <p>Private bar contents</p>
      </BarAccessGate>
    </MemoryRouter>,
  );
  expect(await screen.findByText('Private bar contents')).toBeInTheDocument();
});
it('rechecks access changes received while a request is pending', async () => {
  let resolve!: (value: { blockedUntil: string | null; fightId: null }) => void;
  vi.mocked(fetchBarAccess)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ blockedUntil: '2026-10-12T00:00:00Z', fightId: null });
  render(
    <MemoryRouter>
      <BarAccessGate>
        <p>Private bar contents</p>
      </BarAccessGate>
    </MemoryRouter>,
  );
  window.dispatchEvent(new Event('bar-access-changed'));
  resolve({ blockedUntil: null, fightId: null });
  expect(await screen.findByText('«4-й период» закрыт для тебя')).toBeInTheDocument();
});
