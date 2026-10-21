import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {expect,it,vi} from 'vitest';
import {StadiumPage} from './StadiumPages.js';
vi.mock('../screens/DailyScreen.js',()=>({AmateurDuelsPage:({onOpenMatch}:{onOpenMatch:(id:string)=>void})=><button onClick={()=>onOpenMatch('m1')}>Open duel</button>,AmateurTournamentsPage:()=>null,DuelOpponentPanel:()=> <p>Opponent details</p>,DuelRulesPanel:()=> <p>Duel rules</p>,DuelResultCard:()=> <p>Result</p>}));
vi.mock('../api/amateurDuel.js',()=>({fetchAmateurMatch:async()=>({match:{id:'m1',status:'active'}})}));
function Probe(){const location=useLocation();return <output>{location.search}</output>;}
it('opens small duel details before entering the separate game route',async()=>{
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={['/?view=amateur&section=duels']}><Probe/><StadiumPage id="duels"/></MemoryRouter></QueryClientProvider>);
 fireEvent.click(screen.getByText('Open duel'));
 expect(await screen.findByText('Opponent details')).toBeVisible();
 expect(screen.getByText('Duel rules')).toBeVisible();
 expect(screen.getByText('?view=amateur&section=duels&duel=m1&from=sections')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'На лёд'}));
 expect(screen.getByText('?view=amateur&section=duels&match=m1&play=1&from=sections')).toBeVisible();
});
