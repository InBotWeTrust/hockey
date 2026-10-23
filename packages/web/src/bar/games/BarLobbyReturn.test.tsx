import {render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {expect,it,vi} from 'vitest';
import {BarGamesPage} from './CharacterLaunch.js';
vi.mock('./BarGamesLobby.js',()=>({BarGamesLobby:()=> <p>Legacy lobby</p>}));
function Location(){const location=useLocation();return <output>{location.pathname}{location.search}</output>;}
it.each(['cards','ochko','battleship'])('redirects the old %s lobby into the bar terminal',async kind=>{
 render(<MemoryRouter initialEntries={[`/bar/games?game=${kind}`]}><Routes><Route path="/bar/games" element={<BarGamesPage/>}/><Route path="/bar" element={<Location/>}/></Routes></MemoryRouter>);
 await waitFor(()=>expect(screen.getByText(`/bar?onlineGame=${kind}`)).toBeVisible());
 expect(screen.queryByText('Legacy lobby')).toBeNull();
});
