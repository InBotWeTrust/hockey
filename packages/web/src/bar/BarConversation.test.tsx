import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { BarConversation } from './BarConversation.js';
import { fetchConversation, sendConversation } from './conversationApi.js';
import { ApiError } from '../api/apiFetch.js';
vi.mock('./BarMemoryControls.js',()=>({BarMemoryControls:({onChanged}:{onChanged:()=>Promise<void>})=><button onClick={()=>void onChanged()}>Тестовая очистка памяти</button>}));
vi.mock('./conversationApi.js', () => ({ fetchConversation: vi.fn(), sendConversation: vi.fn() }));
const snapshot = { revision: 0, greeting: 'Привет! Присаживайся.', turns: [], pending: false };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchConversation).mockResolvedValue(snapshot);
});
const open = () =>
  render(<BarConversation character="maria" name="Мария" onClose={() => {}} onUpdate={() => {}} />);
it('shows the configured position below the name', async () => {
  render(
    <BarConversation
      character="veronika"
      name="Вероника"
      role="Управляющая"
      onClose={() => {}}
      onUpdate={() => {}}
    />,
  );
  expect(screen.getByText('Управляющая')).toBeInTheDocument();
  expect(screen.queryByText('Разговор в баре')).not.toBeInTheDocument();
  await screen.findByText(snapshot.greeting);
});
it('shows a fixed greeting without calling generation and can expand', async () => {
  open();
  expect(await screen.findByText(snapshot.greeting)).toBeInTheDocument();
  expect(sendConversation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть разговор' }));
  expect(screen.getByRole('button', { name: 'Свернуть разговор' })).toBeInTheDocument();
});
it('sends only once while waiting and renders saved response', async () => {
  let resolve!: (s: typeof snapshot) => void;
  vi.mocked(sendConversation).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  open();
  await screen.findByText(snapshot.greeting);
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст сообщения' }), {
    target: { value: 'Привет' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  expect(sendConversation).toHaveBeenCalledTimes(1);
  expect(within(screen.getByRole('log')).getByText('Привет')).toBeInTheDocument();
  await waitFor(()=>expect(screen.getByRole('textbox')).toHaveValue(''));
  expect(screen.getByRole('status')).toHaveTextContent('Мария думает');
  await act(async () =>
    resolve({
      ...snapshot,
      revision: 1,
      turns: [{ id: 'id', user: 'Привет', assistant: 'Рада тебя видеть', createdAt: 'now' }],
    } as unknown as typeof snapshot),
  );
  expect(screen.getByText('Рада тебя видеть')).toBeInTheDocument();
  expect(within(screen.getByRole('log')).getAllByText('Привет')).toHaveLength(1);
  expect(screen.queryByText('Ты:')).not.toBeInTheDocument();
  expect(screen.queryByText('Мария:')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Твоё сообщение')).toHaveTextContent('Привет');
  expect(screen.getAllByLabelText('Сообщение Мария')).toHaveLength(2);
});
it('retains the visible message and retries the same request after an uncertain network failure', async () => {
  vi.mocked(sendConversation)
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue(snapshot);
  open();
  await screen.findByText(snapshot.greeting);
  fireEvent.change(screen.getByRole('textbox', { name: 'Текст сообщения' }), {
    target: { value: 'Привет' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(within(screen.getByRole('log')).getByText('Привет')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить отправку' }));
  await waitFor(() => expect(sendConversation).toHaveBeenCalledTimes(2));
  expect(vi.mocked(sendConversation).mock.calls[0]?.[1]).toEqual(
    vi.mocked(sendConversation).mock.calls[1]?.[1],
  );
});
it('does not send while history failed to load and supports retry', async () => {
  vi.mocked(fetchConversation)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(snapshot);
  open();
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
  await screen.findByText(snapshot.greeting);
  expect(fetchConversation).toHaveBeenCalledTimes(2);
});
it('retains text and reloads history on a stale revision instead of resending automatically', async () => {
  vi.mocked(sendConversation).mockRejectedValue(new ApiError(409, 'conversation_stale', 'stale'));
  open();
  await screen.findByText(snapshot.greeting);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Мой вопрос' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(within(screen.getByRole('log')).getByText('Мой вопрос')).toBeInTheDocument();
  expect(sendConversation).toHaveBeenCalledTimes(1);
});

it('makes personal memory controls discoverable in the conversation',async()=>{
  open();await screen.findByText(snapshot.greeting);
  expect(screen.getByRole('button',{name:'Память'})).toBeEnabled();
});

it('does not show the memory explanation under the identity',async()=>{open();await screen.findByText(snapshot.greeting);expect(screen.queryByText(/Персонаж может запоминать/)).not.toBeInTheDocument();});
it('rotates waiting copy and clears its timer after completion',async()=>{
 let finish!:(value:typeof snapshot)=>void;
 vi.mocked(sendConversation).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const view=open();await screen.findByText(snapshot.greeting);
 vi.useFakeTimers();
 const interval=vi.spyOn(globalThis,'setInterval'),cancel=vi.spyOn(globalThis,'clearInterval');
 try {
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Как дела?'}});
  fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
  expect(screen.getByRole('status')).toHaveTextContent('Мария думает');
  await act(()=>vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByRole('status')).toHaveTextContent('Мария подбирает слова');
  await act(async()=>finish(snapshot));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(interval.mock.results[0]?.value);
 } finally {interval.mockRestore();cancel.mockRestore();vi.useRealTimers();}
});
it('retries a stale message with the refreshed revision without duplicating its bubble',async()=>{
 vi.mocked(fetchConversation).mockResolvedValueOnce(snapshot).mockResolvedValue({...snapshot,revision:7});
 vi.mocked(sendConversation).mockRejectedValueOnce(new ApiError(409,'conversation_stale','stale')).mockImplementationOnce(async(_character,message)=>({...snapshot,revision:8,turns:[{id:message.id,user:message.content,assistant:'Поняла',createdAt:'now'}]}));
 open();await screen.findByText(snapshot.greeting);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Привет'}});
 fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
 await screen.findByRole('alert');
 await waitFor(()=>expect(fetchConversation).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'Повторить отправку'}));
 await screen.findByText('Поняла');
 expect(vi.mocked(sendConversation).mock.calls[1]?.[1].revision).toBe(7);
 expect(within(screen.getByRole('log')).getAllByText('Привет')).toHaveLength(1);
});

it('drops failed local messages when privacy controls clear the conversation',async()=>{
 vi.mocked(sendConversation).mockRejectedValue(new Error('offline'));
 open();await screen.findByText(snapshot.greeting);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Не сохранять эту реплику'}});
 fireEvent.click(screen.getByRole('button',{name:'Отправить'}));
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Память'}));
 fireEvent.click(screen.getByRole('button',{name:'Тестовая очистка памяти'}));
 await waitFor(()=>expect(fetchConversation).toHaveBeenCalledTimes(2));
 fireEvent.click(screen.getByRole('button',{name:'К разговору'}));
 expect(screen.queryByText('Не сохранять эту реплику')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Повторить отправку'})).not.toBeInTheDocument();
});

it('anchors the dialogue above the keyboard using the visible application viewport', async () => {
  open();
  await screen.findByText(snapshot.greeting);
  const backdrop = screen.getByRole('dialog').parentElement;
  expect(backdrop?.style.height).toBe('var(--app-viewport-height, 100dvh)');
  expect(backdrop?.style.bottom).toBe('auto');
});
it('identifies intervening Oleg with his avatar instead of the conversation character',async()=>{
 vi.mocked(fetchConversation).mockResolvedValue({...snapshot,turns:[{id:'warning',user:'Грубость',assistant:'Хватит хамить.',createdAt:'now',speaker:'oleg',intervention:'intervention'}]});
 open();
 expect(await screen.findByLabelText('Сообщение Олег')).toHaveTextContent('Хватит хамить.');
 expect(screen.getByRole('img',{name:'Олег'})).toHaveAttribute('src','/bar/cards/oleg-avatar-v2.webp');
});
it('renders a physical intervention from Oleg without an empty user bubble', async()=>{
 vi.mocked(fetchConversation).mockResolvedValue({...snapshot,turns:[{id:'gesture',user:'',assistant:'Руки убрал.',createdAt:'now',speaker:'oleg',intervention:'intervention',event:'physical'}]});
 open();expect(await screen.findByText('Руки убрал.')).toBeInTheDocument();expect(screen.getByRole('img',{name:'Олег'})).toBeInTheDocument();expect(screen.queryByLabelText('Твоё сообщение')).not.toBeInTheDocument();
});
