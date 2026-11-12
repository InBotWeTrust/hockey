import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ApartmentHome } from './ApartmentHome.js';
import { apartmentProfile } from '../../section-preview/apartmentFixtures.js';

vi.mock('../../api/apiFetch.js', () => ({ apiFetch: vi.fn() }));
beforeEach(() => localStorage.clear());
function Location() {
  return <output aria-label="Маршрут">{useLocation().pathname}</output>;
}
function setup(initial = '/profile', empty = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['referrals', 'summary'], { unclaimedRewardsCount: 0 });
  client.setQueryData(['profile'], {
    ...apartmentProfile,
    trophySummary: empty
      ? {
          regularSeasonWins: 0,
          tournamentChampionships: 0,
          tournamentPodiums: 0,
          completedChallenges: 0,
        }
      : apartmentProfile.trophySummary,
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <ApartmentHome owner="test">
          <p>Содержимое действующего профиля</p>
          <input aria-label="Черновик" defaultValue="" />
        </ApartmentHome>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('opens the existing profile as a dismissible interface over the room', async () => {
  setup();
  expect(screen.queryByText('Содержимое действующего профиля')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  const dialog = await screen.findByRole('region', { name: 'Профиль' });
  expect(dialog).toBeInTheDocument();
  expect(dialog.closest('.modal-backdrop')).toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('Содержимое действующего профиля')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Профиль' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('img', { name: 'Квартира: Базовая' })).toBeInTheDocument();
});
it('keeps the apartment mounted while opening the existing friends route', async () => {
  setup();
  fireEvent.click(screen.getByRole('tab', { name: 'Друзья' }));
  expect(screen.getByLabelText('Маршрут')).toHaveTextContent('/profile/friends');
  expect(await screen.findByRole('region', { name: 'Друзья' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { selected: true }));
  expect(screen.queryByRole('region', { name: 'Друзья' })).not.toBeInTheDocument();
});
it('does not display unearned cups and tolerates corrupt appearance preferences', () => {
  localStorage.setItem('apartment-appearance:test', '{broken');
  const view = setup('/profile', true);
  expect(view.container.querySelectorAll('[data-trophy-index]')).toHaveLength(0);
  expect(screen.getByRole('img', { name: 'Квартира: Базовая' })).toBeInTheDocument();
});

it('uses the project navigation and has no extra home or back control in the header', () => {
  setup();
  expect(screen.getByRole('tablist', { name: 'Разделы: Квартира' })).toHaveClass(
    'section-scene__dock',
  );
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(screen.queryByRole('button', { name: 'На карту' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Домой' })).not.toBeInTheDocument();
});

it('keeps any intermediate camera position after releasing a drag', async () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  setup();
  const surface = screen.getByRole('group', { name: 'Перемещение по квартире' });
  const scene = screen.getByRole('img', { name: 'Квартира: Базовая' });
  fireEvent.pointerDown(surface, { clientX: 280, clientY: 250, button: 0 });
  fireEvent.pointerMove(surface, { clientX: 220, clientY: 255 });
  await waitFor(() =>
    expect(Number(scene.getAttribute('viewBox')?.split(' ')[0])).toBeGreaterThan(-30),
  );
  const afterMove = Number(scene.getAttribute('viewBox')?.split(' ')[0]);
  expect(afterMove).toBeGreaterThan(-30);
  expect(afterMove).toBeLessThan(400);
  fireEvent.pointerUp(surface, { clientX: 220, clientY: 255 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(Number(scene.getAttribute('viewBox')?.split(' ')[0])).toBeCloseTo(afterMove, 1);
  fireEvent.pointerDown(surface, { clientX: 220, clientY: 250, button: 0 });
  fireEvent.pointerMove(surface, { clientX: 250, clientY: 255 });
  fireEvent.pointerUp(surface, { clientX: 250, clientY: 255 });
  expect(Number(scene.getAttribute('viewBox')?.split(' ')[0])).toBeLessThan(afterMove);
  vi.unstubAllGlobals();
});
it('uses one continuous floor image rather than wrapping it at the room edge', () => {
  const view = setup();
  const floorImage = view.container.querySelector('[data-surface="floor"]');
  expect(floorImage?.tagName).toBe('image');
  expect(Number(floorImage?.getAttribute('x'))).toBeLessThan(-30);
  expect(floorImage?.closest('pattern')).toBeNull();
});
it('ignores vertical gestures and cancels interrupted drags', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  setup();
  const surface = screen.getByRole('group', { name: 'Перемещение по квартире' });
  fireEvent.pointerDown(surface, { clientX: 280, clientY: 250, button: 0 });
  fireEvent.pointerMove(surface, { clientX: 275, clientY: 370 });
  fireEvent.pointerUp(surface, { clientX: 275, clientY: 370 });
  expect(screen.getByRole('img', { name: 'Квартира: Базовая' }).getAttribute('viewBox')).toMatch(
    /^-30 /,
  );
  fireEvent.pointerDown(surface, { clientX: 280, clientY: 250, button: 0 });
  fireEvent.pointerCancel(surface);
  fireEvent.pointerMove(surface, { clientX: 30, clientY: 250 });
  fireEvent.pointerUp(surface, { clientX: 30, clientY: 250 });
  expect(screen.getByRole('img', { name: 'Квартира: Базовая' }).getAttribute('viewBox')).toMatch(
    /^-30 /,
  );
  vi.unstubAllGlobals();
});

it('opens object interfaces and returns to the room without losing content', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Персонаж: профиль' }));
  const content = screen.getByText('Содержимое действующего профиля');
  expect(screen.getByRole('region', { name: 'Профиль' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { selected: true }));
  expect(screen.queryByRole('region', { name: 'Профиль' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  expect(screen.getByText('Содержимое действующего профиля')).toBe(content);
  fireEvent.click(screen.getByRole('tab', { selected: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Телевизор: сюжет' }));
  expect(screen.getByRole('region', { name: 'Сюжет' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('opens appearance inside the same panel and returns to settings', () => {
  setup('/profile/settings');
  fireEvent.click(screen.getByRole('button', { name: /^Оформление квартиры/ }));
  expect(screen.getByRole('region', { name: 'Оформление квартиры' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'К настройкам' }));
  expect(screen.getByRole('region', { name: 'Настройки' })).toBeInTheDocument();
});

it('retains draft values and scroll position when collapsed', () => {
  const view = setup();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Черновик' }), {
    target: { value: 'Мой текст' },
  });
  const scroller = view.container.querySelector('.home-apartment-panel__scroll')!;
  scroller.scrollTop = 123;
  fireEvent.scroll(scroller);
  fireEvent.click(screen.getByRole('tab', { selected: true }));
  expect(view.container.querySelector('.home-apartment-panel')).toHaveAttribute('inert');
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('Мой текст');
  expect(scroller.scrollTop).toBe(123);
});
it('does not activate an object after dragging across it or block the next dock click', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  setup();
  const surface = screen.getByRole('group', { name: 'Перемещение по квартире' });
  const target = screen.getByRole('button', { name: 'Персонаж: профиль' });
  fireEvent.pointerDown(target, { clientX: 280, clientY: 250, button: 0 });
  fireEvent.pointerMove(surface, { clientX: 220, clientY: 255 });
  fireEvent.pointerUp(surface, { clientX: 220, clientY: 255 });
  fireEvent.click(target);
  expect(screen.queryByRole('region', { name: 'Профиль' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Друзья' }));
  expect(screen.getByRole('region', { name: 'Друзья' })).toBeInTheDocument();
  vi.unstubAllGlobals();
});

it('marks objects with a fixed pulse anchor and a circular expanding ring like the bar', () => {
  const view = setup();
  const objects = screen.getByRole('group', { name: 'Предметы квартиры' });
  for (const target of objects.querySelectorAll('[role="button"]')) {
    const anchor = target.querySelector('.home-apartment__pulse');
    expect(anchor).not.toBeNull();
    expect(anchor?.querySelector(':scope > circle.home-apartment__pulse-ring')).not.toBeNull();
  }
  expect(view.container.querySelector('.home-apartment__object-glow')).toBeNull();
});

it('keeps the dock while opening a terminal-style interface without duplicated identity', () => {
  setup();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  expect(screen.getByRole('tablist', { name: 'Разделы: Квартира' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Открыть паспорт игрока' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Вернуться в квартиру' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { selected: true }));
  expect(screen.getByRole('button', { name: 'Открыть паспорт игрока' })).toBeInTheDocument();
});
it('shows a short settings menu instead of all settings at once', () => {
  setup('/profile/settings');
  expect(screen.getByRole('button', { name: 'Профиль Имя, фото и описание' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Приложение Тема и иконки на карте' }));
  expect(screen.getByRole('region', { name: 'Приложение' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'К настройкам' }));
  expect(screen.getByRole('region', { name: 'Настройки' })).toBeInTheDocument();
});

it('switches the open interface from the dock and only collapses on repeated selection', () => {
  setup();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Настройки' }));
  expect(screen.getByRole('region', { name: 'Настройки' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Профиль' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Настройки' }));
  expect(screen.queryByRole('region', { name: 'Настройки' })).not.toBeInTheDocument();
});

it('uses the active section as the dock heading and restores Apartment when closed', () => {
  const view = setup();
  const title = () =>
    view.container.querySelector('.home-apartment__navigation .section-scene__identity strong');
  expect(title()).toHaveTextContent('Квартира');
  fireEvent.click(screen.getByRole('tab', { name: 'Награды' }));
  expect(title()).toBeVisible();
  expect(title()).toHaveTextContent('Награды');
  fireEvent.click(screen.getByRole('tab', { name: 'Друзья' }));
  expect(title()).toHaveTextContent('Друзья');
  fireEvent.click(screen.getByRole('tab', { selected: true }));
  expect(title()).toHaveTextContent('Квартира');
  expect(
    view.container.querySelector('.home-apartment__navigation .section-scene__identity > span'),
  ).toBeNull();
});

it('opens the passport without an extra Apartment heading or enclosing card', () => {
  setup();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  expect(screen.queryByRole('heading', { name: 'Квартира' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Профиль' })).toHaveClass(
    'home-apartment-panel--passport',
  );
});

it('shows content without a section heading or close control and dismisses from the active dock', () => {
  setup();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  expect(screen.queryByRole('heading', { name: 'Профиль' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Закрыть раздел' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Профиль' }));
  expect(screen.queryByRole('region', { name: 'Профиль' })).not.toBeInTheDocument();
});
it('combines identity, avatar experience and two icon-only balances in one header', () => {
  const view = setup();
  const identity = view.container.querySelector('.home-apartment__identity')!;
  expect(identity.querySelector('.public-profile-experience')).not.toBeNull();
  expect(identity.querySelector('.home-apartment__wallet')).not.toBeNull();
  expect(identity.querySelectorAll('.home-apartment__wallet > div')).toHaveLength(2);
  expect(identity.querySelector('.home-apartment__wallet small')).toBeNull();
  expect(identity.querySelector('.home-apartment__wallet')).toHaveTextContent(/1\s000/);
});

it('pans smoothly to the object selected from the dock', async () => {
  const view = setup();
  const scene = screen.getByRole('img', { name: 'Квартира: Базовая' });
  fireEvent.click(screen.getByRole('tab', { name: 'Настройки' }));
  const initialCamera = Number(scene.getAttribute('viewBox')?.split(' ')[0]);
  await waitFor(() => expect(Number(scene.getAttribute('viewBox')?.split(' ')[0])).toBeGreaterThan(initialCamera));
  await waitFor(() => {
    const target = view.container.querySelector('[data-apartment-page="settings"]')!;
    const center = Number(target.getAttribute('data-center-x'));
    expect(Number(scene.getAttribute('viewBox')?.split(' ')[0])).toBeCloseTo(Math.min(864 - 450, center - 225), 0);
  });
});

it('keeps the same settings surface when entering and leaving a subsection', () => {
  setup('/profile/settings');
  const surface = screen.getByRole('region', { name: 'Настройки' });
  expect(surface).toHaveClass('home-apartment-panel--settings');
  fireEvent.click(screen.getByRole('button', { name: 'Профиль Имя, фото и описание' }));
  expect(screen.getByRole('region', { name: 'Профиль' })).toBe(surface);
  expect(surface).toHaveClass('home-apartment-panel--settings');
  fireEvent.click(screen.getByRole('button', { name: 'К настройкам' }));
  expect(screen.getByRole('region', { name: 'Настройки' })).toBe(surface);
});

it('never pans past the painted right edge of the room', () => {
 vi.stubGlobal('PointerEvent', MouseEvent);
 setup();
 const surface=screen.getByRole('group',{name:'Перемещение по квартире'});
 fireEvent.pointerDown(surface,{clientX:400,clientY:250,button:0});
 fireEvent.pointerMove(surface,{clientX:-1000,clientY:250});
 const scene=screen.getByRole('img',{name:'Квартира: Базовая'});
 expect(Number(scene.getAttribute('viewBox')?.split(' ')[0])+450).toBeLessThanOrEqual(864);
 vi.unstubAllGlobals();
});
