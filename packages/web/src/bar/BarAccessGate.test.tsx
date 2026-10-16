import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen,fireEvent,act } from '@testing-library/react';
import { MemoryRouter,useLocation } from 'react-router-dom';
import { BarAccessGate } from './BarAccessGate.js';
import { fetchBarAccess } from './olegFightApi.js';
import {cityTimeOfDay} from '../city/lighting.js';
vi.mock('./OlegFightPanel.js',()=>({OlegFightPanel:({onDone}:{onDone:(access:{blockedUntil:string|null;fightId:string|null})=>void})=><div>Fight result fixture<button onClick={()=>onDone({blockedUntil:'2026-10-12T00:00:00Z',fightId:null})}>Close loss</button></div>}));
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

it('keeps the fight result visible despite access refreshes announcing a block',async()=>{
 vi.mocked(fetchBarAccess).mockResolvedValueOnce({blockedUntil:null,fightId:'fight'}).mockResolvedValue({blockedUntil:'2026-10-12T00:00:00Z',fightId:null});
 render(<MemoryRouter><BarAccessGate><p>Private bar contents</p></BarAccessGate></MemoryRouter>);
 await screen.findByText('Fight result fixture');
 await act(async()=>{window.dispatchEvent(new Event('bar-access-changed'));});
 expect(screen.getByText('Fight result fixture')).toBeInTheDocument();
 expect(screen.queryByText('«4-й период» закрыт для тебя')).not.toBeInTheDocument();
});

function Location(){const location=useLocation();return <p data-testid="location">{location.pathname}</p>;}
it('returns a closed loss result to the second main-menu tab',async()=>{
 vi.mocked(fetchBarAccess).mockResolvedValue({blockedUntil:null,fightId:'fight'});
 render(<MemoryRouter initialEntries={['/bar']}><BarAccessGate><p>Private bar contents</p></BarAccessGate><Location/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Close loss'}));
 expect(screen.getByTestId('location')).toHaveTextContent('/sections');
});
it('shows a blocked re-entry in a modal with Oleg at the entrance',async()=>{
 vi.mocked(fetchBarAccess).mockResolvedValue({blockedUntil:'2026-10-12T00:00:00Z',fightId:null});
 render(<MemoryRouter><BarAccessGate><p>Private bar contents</p></BarAccessGate></MemoryRouter>);
 expect(await screen.findByRole('dialog',{name:'Бар закрыт'})).toBeInTheDocument();
 expect(screen.getByRole('img',{name:'Олег стоит у входа и не пускает в бар'})).toHaveAttribute('src',`/bar/city-v3/oleg-blocked-${cityTimeOfDay(new Date())}-v3.webp`);
});

it('checks access at countdown zero and waits for server confirmation before entering',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-12T20:59:58Z'));
 let confirm!:(access:{blockedUntil:string|null;fightId:string|null})=>void;
 vi.mocked(fetchBarAccess).mockResolvedValueOnce({blockedUntil:'2026-10-12T21:00:00Z',fightId:null}).mockImplementation(()=>new Promise(resolve=>{confirm=resolve;}));
 const view=render(<MemoryRouter><BarAccessGate><p>Private bar contents</p></BarAccessGate></MemoryRouter>);
 try {
  await act(async()=>{});expect(screen.getByRole('timer')).toHaveTextContent('00:00:02');
  await act(()=>vi.advanceTimersByTimeAsync(2000));
  expect(fetchBarAccess).toHaveBeenCalledTimes(2);expect(screen.queryByText('Private bar contents')).not.toBeInTheDocument();
  await act(async()=>confirm({blockedUntil:null,fightId:null}));
  expect(screen.getByText('Private bar contents')).toBeInTheDocument();
 } finally {view.unmount();vi.useRealTimers();}
});
