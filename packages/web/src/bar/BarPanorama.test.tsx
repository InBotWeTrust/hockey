import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createDefaultBarLayout, type BarLayoutSnapshot } from '@hockey/game-core';
import { BarPanorama } from './BarPanorama.js';
import { fetchBarLayout } from './layoutApi.js';
import { fetchConversation, sendConversation } from './conversationApi.js';
import type * as ConversationApi from './conversationApi.js';
vi.mock('./layoutApi.js', () => ({ fetchBarLayout: vi.fn() }));
vi.mock('./conversationApi.js', async (original) => ({
  ...(await original<typeof ConversationApi>()),
  fetchConversation: vi.fn(),
  sendConversation: vi.fn(),
}));
const fixture = () => {
  const layout = createDefaultBarLayout();
  for (const p of Object.values(layout.profiles)) {
    p.avatar = null;
    p.composition = null;
  }
  return { revision: 2, layout };
};
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(fetchConversation).mockResolvedValue({
    revision: 0,
    greeting: 'Привет!',
    pending: false,
    turns: [],
  });
});
it('offers a continued conversation from server history after entering the bar', async () => {
  const data = fixture();
  data.layout.defaultSlotId = 'bar-3';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  vi.mocked(fetchConversation).mockResolvedValue({
    revision: 1,
    greeting: 'Привет!',
    pending: false,
    turns: [{ id: 'turn', user: 'Вопрос', assistant: 'Ответ', createdAt: 'today' }],
  });
  render(
    <MemoryRouter>
      <BarPanorama />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Мария' });
  fireEvent.click(screen.getByRole('button', { name: 'Показать действия' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Продолжить разговор' }));
  expect(await screen.findByRole('dialog', { name: 'Разговор: Мария' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'О персонаже: Мария' })).not.toBeInTheDocument();
  expect(await screen.findByText('Ответ')).toBeInTheDocument();
  expect(screen.getAllByText('Официантка').length).toBeGreaterThan(0);
  expect(sendConversation).not.toHaveBeenCalled();
});
it('uses saved default when no page has been selected', async () => {
  const data = fixture();
  data.layout.defaultSlotId = 'bar-3';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  render(
    <MemoryRouter>
      <BarPanorama />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Мария' })).toBeInTheDocument();
});
it('does not reset a selected stable slot on delayed reordered data', async () => {
  let resolve: (s: BarLayoutSnapshot) => void = () => {};
  vi.mocked(fetchBarLayout).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(
    <MemoryRouter>
      <BarPanorama />
    </MemoryRouter>,
  );
  fireEvent.focus(screen.getByRole('button', { name: /^Мария$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Перейти: Мария' }));
  const data = fixture();
  data.layout.slots.reverse();
  data.layout.defaultSlotId = 'bar-1';
  await act(async () => resolve(data));
  expect(screen.getByRole('heading', { name: 'Мария' })).toBeInTheDocument();
});
it('retains usable defaults on error and retries the read', async () => {
  vi.mocked(fetchBarLayout)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(fixture());
  render(
    <MemoryRouter>
      <BarPanorama />
    </MemoryRouter>,
  );
  await screen.findByText('Не удалось загрузить расстановку.');
  expect(screen.getByText('Персонаж в разработке')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await act(async () => {});
  expect(fetchBarLayout).toHaveBeenCalledTimes(2);
});

it('restores the selected character after returning from a game', async () => {
  sessionStorage.setItem('bar-active-slot', 'bar-1');
  vi.mocked(fetchBarLayout).mockResolvedValue(fixture());
  render(<MemoryRouter><BarPanorama /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Дарья' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Поговорить' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Показать действия' }));
  expect(screen.getByRole('button', { name: 'Поговорить' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть действия' }));
  expect(screen.queryByRole('button', { name: 'Поговорить' })).not.toBeInTheDocument();
});

it('expands character actions from the identity row without a modal', async () => {
  const data = fixture();
  data.layout.defaultSlotId = 'bar-3';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  render(<MemoryRouter><BarPanorama /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'О персонаже: Мария' }));
  expect(screen.getByRole('button', { name: 'Сыграть в карты' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('shows a brief authored smile on entering a calm character and returns to neutral',async()=>{
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 const random=vi.spyOn(Math,'random').mockReturnValue(0);
 try{
  const data=fixture();data.layout.defaultSlotId='bar-3';data.layout.profiles.maria.composition='/bar/cards/maria-selection-v1.webp';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await waitFor(()=>expect(view.container.querySelector('svg[data-current][data-frame="/bar/emotions/maria/greeting-v1.webp"]')).not.toBeNull());
  await waitFor(()=>expect(view.container.querySelector('img[data-current][src="/bar/emotions/maria/neutral-v1.webp"]')).not.toBeNull(),{timeout:3000});
 }finally{random.mockRestore();vi.stubGlobal('Image',image);}
});
it('does not overwrite a newer conversation emotion with a delayed entry read',async()=>{
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 let old!:(value:{revision:number;greeting:string;pending:boolean;turns:[]})=>void,reads=0;
 const data=fixture();data.layout.defaultSlotId='bar-3';data.layout.profiles.maria.composition='/bar/cards/maria-selection-v1.webp';
 vi.mocked(fetchBarLayout).mockResolvedValue(data);
 vi.mocked(fetchConversation).mockImplementation(async character=>{
  if(character==='maria'&&++reads===1)return new Promise(resolve=>{old=resolve;});
  return {revision:2,greeting:'Привет!',pending:false,turns:[{id:'new',user:'Устал',assistant:'Бывает.',createdAt:'now',emotion:'empathy' as const}]};
 });
 try{
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await screen.findByRole('heading',{name:'Мария'});
  fireEvent.click(screen.getByRole('button',{name:'Показать действия'}));fireEvent.click(screen.getByRole('button',{name:'Поговорить'}));
  await screen.findByText('Бывает.');
  await waitFor(()=>expect(view.container.querySelector('img[src="/bar/emotions/maria/empathy-v1.webp"]')).not.toBeNull());
  await act(async()=>old({revision:0,greeting:'Привет!',pending:false,turns:[]}));
  expect(view.container.querySelector('img[src="/bar/emotions/maria/empathy-v1.webp"]')).not.toBeNull();
 }finally{vi.stubGlobal('Image',image);}
});
