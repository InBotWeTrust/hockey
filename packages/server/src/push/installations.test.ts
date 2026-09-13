import { describe, expect, it, vi } from 'vitest';
import { deleteAndroidInstallation, saveAndroidInstallation } from './installations.js';

describe('Android push installations', () => {
  it('rotates a token only for the authenticated installation owner', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });

    await saveAndroidInstallation(
      { query },
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      { token: 'fcm-token', appVersionCode: 7 },
    );

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain('on conflict (user_id, installation_id) do update');
    expect(sql).toContain('disabled_at = null');
    expect(values).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'fcm-token',
      7,
    ]);
  });

  it('does not delete another user installation', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });

    await deleteAndroidInstallation(
      { query },
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

    expect(query.mock.calls[0]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });
});
