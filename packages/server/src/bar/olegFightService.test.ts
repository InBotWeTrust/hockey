import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import { OlegFightService } from './olegFightService.js';

it('rotates through active fights beyond one worker batch', async () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({
    id: String(index).padStart(4, '0'),
    user_id: `user-${index}`,
  }));
  const query = vi.fn(async (_sql: string, args?: string[]) => ({
    rows: rows.filter((row) => !args?.[0] || row.id > args[0]).slice(0, 100),
  }));
  const service = new OlegFightService({ query } as unknown as Pool);
  const read = vi.spyOn(service, 'read').mockResolvedValue({} as never);
  await service.tick();
  await service.tick();
  await service.tick();
  expect(new Set(read.mock.calls.map((call) => call[1])).size).toBe(205);
});

it('does not stop updating other fights when one fight fails', async () => {
  const query = vi.fn().mockResolvedValue({
    rows: [
      { id: 'a', user_id: 'one' },
      { id: 'b', user_id: 'two' },
    ],
  });
  const service = new OlegFightService({ query } as unknown as Pool);
  const read = vi
    .spyOn(service, 'read')
    .mockRejectedValueOnce(new Error('temporary'))
    .mockResolvedValue({} as never);
  await service.tick().catch(() => {});
  expect(read).toHaveBeenCalledWith('two', 'b');
});
