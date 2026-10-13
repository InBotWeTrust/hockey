import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

describe('social profile controls',()=>{
  it('opens public lists and changes membership without applying failed requests',async()=>{
    const module=await import('./SocialProfile.js').catch(()=>null);
    const context=await import('./SocialContext.js').catch(()=>null);
    const follow=vi.fn().mockRejectedValueOnce(new Error('Сеть недоступна')).mockResolvedValue({followersCount:1,followingCount:0,following:true,canFollow:true});
    const api={summary:vi.fn().mockResolvedValue({followersCount:0,followingCount:0,following:false,canFollow:true}),follow,people:vi.fn().mockResolvedValue({items:[],nextCursor:null}),history:vi.fn().mockResolvedValue({items:[],nextCursor:null})};
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    if(module&&context) render(<MemoryRouter><QueryClientProvider client={client}><context.SocialProvider value={{viewerId:'viewer',api:api as never}}><module.SocialProfile userId="player" /></context.SocialProvider></QueryClientProvider></MemoryRouter>);
    else render(<div />);
    const button=await screen.findByRole('button',{name:'Стать болельщиком'});
    fireEvent.click(button);
    expect(await screen.findByText('Сеть недоступна')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Стать болельщиком'})).toBeTruthy();
    fireEvent.click(button);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Вы болельщик'})).toBeTruthy());
    fireEvent.click(screen.getByRole('button',{name:'Вы болельщик'}));
    expect(screen.getByRole('button',{name:'Перестать болеть'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Рейтинг болельщиков'})).toBeNull();
  });
  it('requires confirmation before removing a fan and keeps the list on cancel',async()=>{
    const {SocialProfile}=await import('./SocialProfile.js');const {SocialProvider}=await import('./SocialContext.js');
    const fan={id:'fan',displayName:'Алексей',avatarUrl:null};
    const removeFan=vi.fn().mockResolvedValue({followersCount:0,followingCount:0,following:false,canFollow:false});
    const api={summary:vi.fn().mockResolvedValue({followersCount:1,followingCount:0,following:false,canFollow:false}),people:vi.fn().mockResolvedValue({items:[fan],nextCursor:null}),fanRating:vi.fn().mockResolvedValue({items:[],nextCursor:null}),removeFan};
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    render(<MemoryRouter><QueryClientProvider client={client}><SocialProvider value={{viewerId:'owner',api:api as never}}><SocialProfile userId="owner"/></SocialProvider></QueryClientProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:'Рейтинг болельщиков'}));
    fireEvent.click(await screen.findByRole('button',{name:'Управление болельщиками'}));
    fireEvent.click(await screen.findByRole('button',{name:'Удалить Алексей из болельщиков'}));
    expect(removeFan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Отмена'}));expect(removeFan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Удалить Алексей из болельщиков'}));
    fireEvent.click(screen.getByRole('button',{name:'Удалить болельщика'}));
    await waitFor(()=>expect(removeFan).toHaveBeenCalledWith('fan'));
  });

  it('consumes a push link once and opens the player after async profile loading',async()=>{
    const {SocialProfile}=await import('./SocialProfile.js');const {SocialProvider}=await import('./SocialContext.js');
    const profile=vi.fn().mockResolvedValue({id:'fan',displayName:'Новый болельщик',avatarUrl:null});
    const api={profile,summary:vi.fn().mockResolvedValue({followersCount:1,followingCount:0,following:false,canFollow:false}),people:vi.fn().mockResolvedValue({items:[],nextCursor:null})};
    const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
    render(<MemoryRouter initialEntries={['/profile?social=fans&fanId=fan']}><QueryClientProvider client={client}><SocialProvider value={{viewerId:'owner',api:api as never,renderProfile:u=><div role="dialog">Карточка: {u.displayName}</div>}}><SocialProfile userId="owner"/></SocialProvider></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText('Карточка: Новый болельщик')).toBeTruthy();
    expect(profile).toHaveBeenCalledTimes(1);
  });
});
