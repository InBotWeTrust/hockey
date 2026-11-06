import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { androidUpdateStore } from '../mobileUpdate/store.js';
import { AndroidUpdateBanner } from './AndroidUpdateBanner.js';
import { MandatoryAndroidUpdateModal } from './MandatoryAndroidUpdateModal.js';

const initial = androidUpdateStore.getState();
afterEach(() => { cleanup(); androidUpdateStore.setState(initial, true); });

it.each(['optional', 'mandatory'] as const)('expands the signed release description for an %s Android update', async policy => {
  androidUpdateStore.setState({
    policy, status: 'ready', dismissedVersionCode: null,
    manifest: {
      versionName: '1.2.3', latestVersionCode: 3, minimumSupportedVersionCode: 1,
      apkUrl: 'https://ultimatehockey.ru/mobile/android/test.apk', apkSizeBytes: 123,
      apkSha256: 'a'.repeat(64), releaseNotes: 'Курорт доступен после первого уровня пляжа.',
      publishedAt: '2026-11-06T10:00:00Z', keyId: 'test', signature: 'test',
    },
  });
  render(policy === 'optional' ? <AndroidUpdateBanner /> : <MandatoryAndroidUpdateModal />);
  const toggle = screen.getByRole('button', { name: 'Что нового' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Курорт доступен после первого уровня пляжа.')).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await waitFor(() => expect(screen.getByText('Курорт доступен после первого уровня пляжа.')).toBeVisible());
  expect(screen.getByRole('button', { name: 'Обновить' })).toBeEnabled();
});

it('mounts the optional Android banner under the existing administrator access gate', () => {
  const app = readFileSync('src/app/App.tsx', 'utf8');
  expect(app).toContain('{androidReleaseAccess && <AndroidUpdateBanner />}');
});
