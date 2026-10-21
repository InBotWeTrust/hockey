import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {act} from '@testing-library/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
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
  'keeps yard pages and panorama positions in the same order for %s',
  (level) => {
    const scene = venueSceneFor('/', '?view=training&section=course', level)!;
    expect(scene.pages.map((p) => p.id)).toEqual(['open', 'course', 'advanced']);
    expect(scene.pages.map((p) => p.position)).toEqual([0, 1, 2]);
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

it.each([
  ['/profile', 'profile'], ['/profile/rewards', 'rewards'], ['/profile/friends','friends'],
  ['/referrals','friends'], ['/profile/settings', 'settings'], ['/profile/story', 'story'],
])('opens five-page apartment at %s', (path, selected) => {
  const scene = venueSceneFor(path, '', 'amateur');
  expect(scene?.id).toBe('apartment');
  expect(scene?.selected).toBe(selected);
  expect(scene?.pages.map(p=>p.label)).toEqual(['Профиль','Награды','Друзья','Настройки','Сюжет']);
  expect(scene?.pages.map(p=>p.position)).toEqual([0,2,4,3,5]);
  expect(scene?.pages.some(p=>p.href==='/profile/equipment')).toBe(false);
  expect(scene?.columns).toBe(6);
});
it('keeps story replay full screen and profile achievements in the task building', () => {
  expect(venueSceneFor('/profile/story/series-1', '', 'amateur')).toBeNull();
  expect(venueSceneFor('/profile/story/series-2', '', 'amateur')).toBeNull();
  expect(venueSceneFor('/profile/achievements', '', 'amateur')?.id).toBe('tasks');
});

it.each(['beginner','amateur','professional'] as const)('puts open training first in the yard for %s', level => {
  const scene=venueSceneFor('/', '?view=training&section=open', level)!;
  expect(scene.pages[0]?.id).toBe('open');
  expect(scene.pages.map(page=>page.position)).toEqual(scene.pages.map((_,index)=>index));
  expect(scene.selected).toBe('open');
});
it('keeps the standalone and legacy locker routes outside the apartment', () => {
  expect(venueSceneFor('/locker-room', '', 'beginner')).toBeNull();
  expect(venueSceneFor('/profile/equipment', '', 'beginner')).toBeNull();
});


afterEach(() => { vi.unstubAllEnvs(); });
it.each(['Начальные','Продвинутые'])('keeps production %s circles closed with a development toast', async label => {
 vi.stubEnv('DEV',false); vi.stubEnv('VITE_TRAINING_EXERCISES_ENABLED','false');
 render(<MemoryRouter initialEntries={['/?view=training&section=open']}><VenuePanorama level="beginner" owner="test"><Location/></VenuePanorama></MemoryRouter>);
 fireEvent.click(screen.getByRole('tab',{name:label}));
 expect(await screen.findByText('В разработке')).toBeVisible();
 expect(screen.getByText('/?view=training&section=open')).toBeInTheDocument();
});
it.each(['course','advanced'])('redirects production direct exercise URL %s to open training', async section => {
 vi.stubEnv('DEV',false); vi.stubEnv('VITE_TRAINING_EXERCISES_ENABLED','false');
 render(<MemoryRouter initialEntries={[`/?view=training&section=${section}&exercise=first-shot&play=1`]}><VenuePanorama level="beginner" owner="test"><Location/></VenuePanorama></MemoryRouter>);
 await waitFor(()=>expect(screen.getByText('/?view=training&section=open&from=sections')).toBeInTheDocument());
 expect(screen.getByText('В разработке')).toBeVisible();
});

it.each(['beginner','amateur','professional'] as const)('does not redirect the production open rink for %s', async level => {
 vi.stubEnv('DEV',false); vi.stubEnv('VITE_TRAINING_EXERCISES_ENABLED','false');
 render(<MemoryRouter initialEntries={['/?view=training&play=1']}><VenuePanorama level={level} owner="test"><Location/></VenuePanorama></MemoryRouter>);
 expect(screen.getByText('/?view=training&play=1')).toBeInTheDocument();
 expect(screen.queryByText('В разработке')).not.toBeInTheDocument();
});

it('publishes incoming duel invitations on the stadium circle and clears resolved events',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(['amateur-duel','events'],{events:[
  {status:'invited',me:{side:'opponent',state:'invited'}},
  {status:'invited',me:{side:'challenger',state:'invited'}},
 ]});
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/?view=amateur&section=duels']}><VenuePanorama level="amateur" owner={null}><span>Дуэли</span></VenuePanorama></MemoryRouter></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByRole('tab',{name:'Дуэли'})).toHaveTextContent('1'));
 await act(async()=>{client.setQueryData(['amateur-duel','events'],{events:[]});});
 await waitFor(()=>expect(screen.getByRole('tab',{name:'Дуэли'}).querySelector('.section-scene__attention')).toBeNull());
 client.clear();
});
