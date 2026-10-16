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
it('shows Timofey handshake on entry, restores neutral, and does not greet again after returning',async()=>{
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 try{
  const data=fixture();
  data.layout.defaultSlotId=data.layout.slots.find(s=>s.occupantId==='timofey')!.id;
  data.layout.profiles.timofey.composition='/bar/cards/timofey-composition-v2.webp';
  data.layout.profiles.oleg.composition='/bar/cards/oleg-composition-v1.webp';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await screen.findByRole('heading',{name:'Тимофей'});
  await waitFor(()=>expect(view.container.querySelector('img[data-current][src="/bar/greetings/timofey-v1.webp"]')).not.toBeNull());
  await waitFor(()=>expect(view.container.querySelector('img[data-current][src="/bar/emotions/timofey/neutral-v1.webp"]')).not.toBeNull(),{timeout:3500});
  fireEvent.click(screen.getByRole('button',{name:/^Олег$/}));
  await screen.findByRole('heading',{name:'Олег'});
  fireEvent.click(screen.getByRole('button',{name:/^Тимофей$/}));
  await screen.findByRole('heading',{name:'Тимофей'});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1600));});
  expect(view.container.querySelector('img[data-current][src="/bar/greetings/timofey-v1.webp"]')).toBeNull();
  view.unmount();
  render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await screen.findByRole('heading',{name:'Тимофей'});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1600));});
  expect(document.querySelector('img[data-current][src="/bar/greetings/timofey-v1.webp"]')).toBeNull();
 }finally{vi.stubGlobal('Image',image);}
},10000);
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
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
  fireEvent.click(await screen.findByRole('button', { name: /^(Разговор|Продолжить разговор)$/ }));
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
  fireEvent.click(screen.getByRole('button', { name: /^Мария$/ }));
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
  expect(screen.getByRole('heading',{name:'Вероника'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await act(async () => {});
  expect(fetchBarLayout).toHaveBeenCalledTimes(2);
});

it('restores the selected character and keeps conversation controls available', async () => {
  sessionStorage.setItem('bar-active-slot', 'bar-1');
  vi.mocked(fetchBarLayout).mockResolvedValue(fixture());
  render(<MemoryRouter><BarPanorama /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Дарья' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Разговор' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Игры' })).toBeInTheDocument();
});
it('opens the existing card game with Maria', async () => {
  const data = fixture(); data.layout.defaultSlotId='bar-3';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  render(<MemoryRouter><BarPanorama /></MemoryRouter>);
  await screen.findByRole('heading',{name:'Мария'});
  fireEvent.click(screen.getByRole('button',{name:'Игры'}));
  expect(screen.getByRole('dialog')).toHaveTextContent('Дурак с Марией');
  expect(screen.getByRole('button',{name:'Играть'})).toBeInTheDocument();
});

it('shows a brief authored smile on entering a calm character and returns to neutral',async()=>{
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 const random=vi.spyOn(Math,'random').mockReturnValue(0.99);
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
  fireEvent.click(screen.getByRole('button',{name:/^(Разговор|Продолжить разговор)$/}));
  await screen.findByText('Бывает.');
  await waitFor(()=>expect(view.container.querySelector('img[src="/bar/emotions/maria/empathy-v1.webp"]')).not.toBeNull());
  await act(async()=>old({revision:0,greeting:'Привет!',pending:false,turns:[]}));
  expect(view.container.querySelector('img[src="/bar/emotions/maria/empathy-v1.webp"]')).not.toBeNull();
 }finally{vi.stubGlobal('Image',image);}
});
it('greets again after swiping back from an opened conversation at the same revision',async()=>{
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 try{
  const data=fixture();data.layout.defaultSlotId='bar-3';data.layout.profiles.maria.composition='/bar/cards/maria-selection-v1.webp';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await screen.findByRole('heading',{name:'Мария'});

  fireEvent.click(screen.getByRole('button',{name:/^(Разговор|Продолжить разговор)$/}));
  await screen.findByText('Привет!');
  fireEvent.click(screen.getByRole('button',{name:'Закрыть разговор'}));
  const scene=view.container.querySelector('main')!;
  fireEvent.touchStart(scene,{touches:[{clientX:300,clientY:300}]});
  fireEvent.touchEnd(scene,{changedTouches:[{clientX:100,clientY:300}]});
  await screen.findByRole('heading',{name:'Арсенич'});
  fireEvent.touchStart(scene,{touches:[{clientX:100,clientY:300}]});
  fireEvent.touchEnd(scene,{changedTouches:[{clientX:300,clientY:300}]});
  await waitFor(()=>expect(view.container.querySelector('svg[data-current][data-frame="/bar/emotions/maria/greeting-v1.webp"]')).not.toBeNull());
 }finally{vi.stubGlobal('Image',image);}
});

it.each(['maria','daria','veronika','arsenich','grigory','oleg','igor','timofey'] as const)('greets %s once per local day and renews the greeting at midnight',async character=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,16,23,59,50));
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 try{
  const data=fixture();
  data.layout.defaultSlotId=data.layout.slots.find(s=>s.occupantId===character)!.id;
  data.layout.profiles[character].composition='/bar/original.webp';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  expect(view.container.querySelector('[data-current][data-character-emotion="greeting"]')).not.toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(3500);});
  expect(view.container.querySelector('[data-current][data-character-emotion="greeting"]')).toBeNull();
  view.unmount();
  const again=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  expect(again.container.querySelector('[data-current][data-character-emotion="greeting"]')).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  expect(again.container.querySelector('[data-current][data-character-emotion="greeting"]')).not.toBeNull();
  again.unmount();
 }finally{vi.useRealTimers();vi.stubGlobal('Image',image);}
});

it('cancels an entry greeting when navigating away before it starts without consuming the day',async()=>{
 vi.useFakeTimers();
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 try{
  const data=fixture();data.layout.defaultSlotId='bar-3';data.layout.profiles.maria.composition='/bar/original.webp';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
  fireEvent.click(screen.getByRole('button',{name:/^Олег$/}));
  await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  fireEvent.click(screen.getByRole('button',{name:/^Мария$/}));
  await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  expect(view.container.querySelector('svg[data-current][data-frame="/bar/emotions/maria/greeting-v1.webp"]')).not.toBeNull();
  view.unmount();
 }finally{vi.useRealTimers();vi.stubGlobal('Image',image);}
});

it('waits for a hidden tab to return before consuming its new-day greeting',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,16,23,59,50));
 const image=globalThis.Image;
 vi.stubGlobal('Image',class{onload:(()=>void)|null=null;onerror:null=null;set src(_value:string){queueMicrotask(()=>this.onload?.());}});
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 try{
  const data=fixture();data.layout.defaultSlotId='bar-3';data.layout.profiles.maria.composition='/bar/original.webp';
  vi.mocked(fetchBarLayout).mockResolvedValue(data);
  const view=render(<MemoryRouter><BarPanorama/></MemoryRouter>);
  await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
  visibility.mockReturnValue('hidden');fireEvent(document,new Event('visibilitychange'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
  visibility.mockReturnValue('visible');fireEvent(document,new Event('visibilitychange'));
  await act(async()=>{});
  await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
  expect(view.container.querySelector('svg[data-current][data-frame="/bar/emotions/maria/greeting-v1.webp"]')).not.toBeNull();
  view.unmount();
 }finally{visibility.mockRestore();vi.useRealTimers();vi.stubGlobal('Image',image);}
});
