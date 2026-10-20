import { expect, it, vi } from 'vitest';
import { apiFetch } from '../../api/apiFetch.js';
it('explains an occupied game instead of exposing a code or a generic failure', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        error: { code: 'bar_game_busy', message: 'Сначала заверши текущую партию.' },
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  try {
    await expect(apiFetch('/bar/games/computer')).rejects.toMatchObject({
      status: 409,
      message: 'Сначала заверши текущую партию в баре.',
    });
  } finally {
    spy.mockRestore();
  }
});
it('explains insufficient stars for Grigory instead of hiding it behind a generic error', async () => {
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'bar_insufficient_stars', message: 'Не хватает звёзд. Измени ставку.' },
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  try {
    await expect(apiFetch('/bar/games/ochko/start')).rejects.toMatchObject({
      message: 'Не хватает звёзд. Измени ставку.',
    });
  } finally {
    spy.mockRestore();
  }
});
