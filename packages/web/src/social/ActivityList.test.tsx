import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { ActivityList } from './ActivityList.js';
import { SocialProvider } from './SocialContext.js';

function setup(fail=false) {
  let unread=true;
  const asOf='2026-10-14T00:00:00.000Z';
  const readFeed=vi.fn(async()=>{
    if(fail)throw new Error('Offline');
    unread=false;return {hasUnread:false,unreadCount:0,asOf};
  });
  const api={feedUnread:async()=>({hasUnread:unread,unreadCount:unread?1:0,asOf}),readFeed,feed:async()=>({items:[{id:'membership',kind:'membership',occurredAt:asOf,unread,actors:[{id:'fan',displayName:'Болельщик',avatarUrl:null}],data:{action:'follow'}}],nextCursor:null})};
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><SocialProvider value={{viewerId:'owner',api:api as never}}><ActivityList/></SocialProvider></QueryClientProvider></MemoryRouter>);
  return {readFeed,asOf};
}
it('marks all from the server snapshot and removes event attention after success',async()=>{
  const {readFeed,asOf}=setup();
  expect(await screen.findByLabelText('Новое событие')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button',{name:'Прочитать всё'}));
  await waitFor(()=>expect(readFeed).toHaveBeenCalledWith({through:asOf}));
  await waitFor(()=>expect(screen.queryByLabelText('Новое событие')).toBeNull());
  expect(screen.getByRole('button',{name:'Прочитать всё'})).toBeDisabled();
  expect(screen.getByText('Непрочитанные · 0')).toBeInTheDocument();
});
it('keeps unread dots when the read request fails',async()=>{
  setup(true);
  await screen.findByLabelText('Новое событие');
  await waitFor(()=>expect(screen.getByRole('button',{name:'Прочитать всё'})).toBeEnabled());
  fireEvent.click(await screen.findByRole('button',{name:'Прочитать всё'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось отметить');
  expect(screen.getByLabelText('Новое событие')).toBeInTheDocument();
});
it('marks a membership event directly without opening a result',async()=>{
  const {readFeed}=setup();
  fireEvent.click(await screen.findByRole('button',{name:/Стал вашим болельщиком/}));
  await waitFor(()=>expect(readFeed).toHaveBeenCalledWith({ids:['membership']}));
  await waitFor(()=>expect(screen.queryByLabelText('Новое событие')).toBeNull());
});
