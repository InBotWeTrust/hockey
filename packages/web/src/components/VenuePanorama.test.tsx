import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { VenuePanorama, venueSceneFor } from './VenuePanorama.js';
it.each([
  ['beginner', 'yard', 4],
  ['amateur', 'stadium', 3],
  ['professional', null, 0],
] as const)('places daily only at the %s location', (level, key, count) => {
  const scene = venueSceneFor('/daily', '', level);
  expect(scene?.id ?? null).toBe(key);
  expect(scene?.pages.length ?? 0).toBe(count);
  if (scene) expect(scene.selected).toBe('daily');
});
it.each(['amateur', 'professional'] as const)(
  'omits daily from the yard for %s without shifting the other zones',
  (level) => {
    const scene = venueSceneFor('/', '?view=training&section=course', level)!;
    expect(scene.pages.map((p) => p.id)).toEqual(['course', 'advanced', 'open']);
    expect(scene.pages.map((p) => p.position)).toEqual([1, 2, 3]);
    expect(scene.columns).toBe(4);
  },
);
it.each(['beginner', 'professional'] as const)('keeps stadium daily absent for %s', (level) => {
  expect(venueSceneFor('/', '?view=amateur&section=duels', level)!.pages.map((p) => p.id)).toEqual([
    'duels',
    'tournaments',
  ]);
});
it.each([
  '?view=training&play=1',
  '?view=training&section=course&exercise=first&play=1',
  '?view=amateur&match=m1',
  '?view=classic&tournament=t1',
  '?view=daily',
])('does not put catalog chrome over gameplay %s', (search) => {
  expect(venueSceneFor('/', search, 'beginner')).toBeNull();
});
it('keeps profile task links in their existing navigation context', () => {
  const scene = venueSceneFor('/profile/achievements/weekly-challenge', '', 'amateur')!;
  expect(scene.selected).toBe('challenges');
  expect(scene.pages[0]!.href).toBe('/profile/achievements');
});
function Location() {
  return <output>{useLocation().pathname + useLocation().search}</output>;
}
it('opens the first yard catalog and allows circles to switch to advanced training', async () => {
  render(
    <MemoryRouter initialEntries={['/?view=training']}>
      <VenuePanorama level="beginner" owner="test">
        <Location />
      </VenuePanorama>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByText('/?view=training&section=course&from=sections')).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Продвинутые' }));
  expect(screen.getByText('/?view=training&section=advanced&from=sections')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'На карту' })).toBeInTheDocument();
});
