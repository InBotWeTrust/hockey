import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AchievementMapNotice } from './AchievementMapNotice.js';
const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
let seen: string[];
beforeEach(() => {
  seen=[];
  vi.stubGlobal('fetch',vi.fn(async (_url,init) => {
    if(init?.method==='POST'){seen.push(...JSON.parse(init.body).ids);return new Response(JSON.stringify({ok:true}));}
    return new Response(JSON.stringify({notifications:ids.filter(id=>!seen.includes(id)).map(id=>({id})),highlightTasks:true}));
  }));
});
function Location(){return <span>{useLocation().search}</span>;}
function setup(enabled=true){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><AchievementMapNotice userId="player" enabled={enabled} onHighlight={vi.fn()}/><Location/></MemoryRouter></QueryClientProvider>);}
it('groups completions, acknowledges the displayed ids and opens the claimable tab',async()=>{
 setup();
 const notice=await screen.findByRole('button',{name:'Новые достижения — 2'});
 await waitFor(()=>expect(seen).toEqual(ids));
 fireEvent.click(notice);
 expect(screen.getByText('?filter=claimable')).toBeInTheDocument();
});
it('does not consume notifications while another map message blocks them',async()=>{
 setup(false);
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 expect(seen).toEqual([]);
 expect(fetch).not.toHaveBeenCalled();
});
it('does not congratulate again after acknowledgement and remount',async()=>{
 const view=setup();
 await screen.findByRole('status');
 await waitFor(()=>expect(seen).toEqual(ids));
 view.unmount();
 setup();
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(3));
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('leaves a background-tab notification pending until the tab becomes visible',async()=>{
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
 setup();
 await screen.findByRole('status');
 expect(seen).toEqual([]);
 visibility.mockReturnValue('visible');
 fireEvent(document,new Event('visibilitychange'));
 await waitFor(()=>expect(seen).toEqual(ids));
 visibility.mockRestore();
});
