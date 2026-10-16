import {render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {expect,it} from 'vitest';
import {GameEntryRoute} from './GameEntryRoute.js';
function MapProbe(){const {search}=useLocation();return <div>Map {search}</div>;}
it.each(['/','/?view=arena','/?view=hub'])('opens the map at the player venue from %s',path=>{
 render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<GameEntryRoute>Old cube</GameEntryRoute>}/><Route path="/sections" element={<MapProbe/>}/></Routes></MemoryRouter>);
 expect(screen.getByText('Map ?home=1')).toBeVisible();expect(screen.queryByText('Old cube')).not.toBeInTheDocument();
});
it.each(['daily','training&play=1','amateur&match=id&play=1','classic&tournament=id'])('preserves the %s game deep link',view=>{
 render(<MemoryRouter initialEntries={[`/?view=${view}`]}><GameEntryRoute>Game flow</GameEntryRoute></MemoryRouter>);expect(screen.getByText('Game flow')).toBeVisible();
});
