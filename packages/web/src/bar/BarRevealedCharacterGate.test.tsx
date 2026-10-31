import {render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {expect,it,vi} from 'vitest';
import {createDefaultBarLayout} from '@hockey/game-core';
import {BarRevealedCharacterGate} from './BarRevealedCharacterGate.js';
import {fetchBarLayout} from './layoutApi.js';
vi.mock('./layoutApi.js',()=>({fetchBarLayout:vi.fn()}));
it.each([true,false])('checks authoritative access before mounting hidden content (novice=%s)',async novice=>{
 vi.mocked(fetchBarLayout).mockResolvedValue({revision:1,layout:createDefaultBarLayout(),novice});
 render(<MemoryRouter initialEntries={['/private']}><Routes><Route path="/private" element={<BarRevealedCharacterGate><p>Private character</p></BarRevealedCharacterGate>}/><Route path="/bar" element={<p>Bar</p>}/></Routes></MemoryRouter>);
 expect(screen.queryByText('Private character')).toBeNull();
 expect(await screen.findByText(novice?'Bar':'Private character')).toBeInTheDocument();
});
