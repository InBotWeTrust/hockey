import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CityMap } from './CityMap.js';
import { applyTourAction, cityTourPlaces, type CityTourApi, type TourState } from './cityTour.js';
const initial: TourState = {
  viewed: [],
  lastLocation: 'yard',
  completed: false,
  gameStarted: false,
  eligible: true,
  target: 100,
  autoShow: true,
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);
function setup(overrides: Partial<TourState> = {}, manual = false) {
  let state = { ...initial, ...overrides };
  let opened = false;
  const api: CityTourApi = {
    open: vi.fn(async () => {
      const result = { ...state, autoShow: !opened && Boolean(state.autoShow) };
      opened = true;
      return result;
    }),
    action: vi.fn(async (a) => {
      state = applyTourAction(state, a);
      return state;
    }),
  };
  const navigate = vi.fn();
  const props = {
    tourPreviewApi: api,
    owner: 'tour-test',
    level: 'beginner' as const,
    daily: '0/90',
    training: '0/100',
    tasks: 'Задания',
    bonus: 'Игры',
    onNavigate: navigate,
    tourRequested: manual,
    maintenanceBlocked: true,
    weatherOverride: 'clear' as const,
  };
  return { api, navigate, props, view: render(<CityMap {...props} />) };
}
it('offers the yard, explores all locations, returns to yard and starts directly', async () => {
  const t = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Осмотреть город' }));
  expect(await screen.findByText('2/13')).toBeVisible();
  await waitFor(()=>expect(t.api.action).toHaveBeenCalledWith({action:'view',location:'locker'}));
  for (let i = 2; i < 13; i++){
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await waitFor(()=>expect(t.api.action).toHaveBeenCalledWith({action:'view',location:cityTourPlaces[i]!.id}));
  }
  expect(await screen.findByRole('button', { name: 'Вернуться во двор' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Вернуться во двор' }));
  expect(screen.getByText('Пора на лёд!')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Во двор – начать игру' }));
  expect(t.navigate).toHaveBeenCalledWith('/daily');
  await waitFor(() => expect(t.api.action).toHaveBeenCalledWith({ action: 'finish' }));
});
it('resumes an interrupted tour without treating entry as play', async () => {
  const t = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Осмотреть город' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать Банк' }));
  expect(screen.getByText('6/13')).toBeVisible();
  expect(t.navigate).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(t.api.action).toHaveBeenCalledWith({ action: 'view', location: 'bank' }),
  );
  t.view.unmount();
  render(<CityMap {...t.props} />);
  await screen.findByRole('button', { name: 'Продолжить знакомство' });
  expect(document.querySelector('.city-tour-spotlight')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить знакомство' }));
  expect(screen.getByText('6/13')).toBeVisible();
});
it('suppresses automatic guidance after play but permits manual review', async () => {
  const t = setup({ gameStarted: true, eligible: false });
  await waitFor(() => expect(t.api.open).toHaveBeenCalled());
  expect(screen.queryByLabelText('Знакомство с городом')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Выбрать Магазин'}));
  expect(t.navigate).toHaveBeenCalledWith('/inventory');
  t.view.unmount();
  render(<CityMap {...t.props} tourRequested />);
  expect(await screen.findByText('1/13')).toBeVisible();
});
it('does not complete when skipping to the last location', async () => {
  setup();
  await screen.findByRole('button', { name: 'Осмотреть город' });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть профиль' }));
  expect(screen.getByText('13/13')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
  expect(screen.getByText('2/13')).toBeVisible();
  expect(applyTourAction(initial, { action: 'finish' }).completed).toBe(false);
  expect(cityTourPlaces).toHaveLength(13);
});
it('keeps a small resume action after play and opens the first unseen place', async () => {
  const t = setup({
    gameStarted: true,
    eligible: false,
    viewed: ['yard', 'locker', 'shop', 'tasks', 'chat'],
    lastLocation: 'chat',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Осмотреть город · пройдено 5/13' }));
  expect(screen.getByText('6/13')).toBeVisible();
  expect(t.navigate).not.toHaveBeenCalled();
});
it('shows an unseen location on its first click and enters on its second click', async () => {
  const t = setup({ gameStarted: true, eligible: false, viewed: ['yard'], autoShow: false });
  await screen.findByRole('button', { name: 'Осмотреть город · пройдено 1/13' });
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать Магазин' }));
  expect(screen.getByText('3/13')).toBeVisible();
  expect(t.navigate).not.toHaveBeenCalled();
  await waitFor(()=>expect(t.api.action).toHaveBeenCalledWith({action:'view',location:'shop'}));
  fireEvent.click(screen.getByRole('button', { name: 'На карте: Магазин' }));
  expect(t.navigate).toHaveBeenCalledWith('/inventory');
});
it('hides the resume action when all places have been seen', async () => {
  setup({ gameStarted: true, eligible: false, viewed: cityTourPlaces.map((p) => p.id) });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /Осмотреть город ·/ })).toBeNull(),
  );
});
it('does not mark the restored map selection as viewed before centering the requested tour',async()=>{
 const t=setup({viewed:['bank'],lastLocation:'bank'},true);
 await screen.findByText('6/13');
 await waitFor(()=>expect(t.api.open).toHaveBeenCalled());
 expect(t.api.action).not.toHaveBeenCalledWith({action:'view',location:'yard'});
});
