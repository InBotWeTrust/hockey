import {render,screen,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {WindowHandleHint} from './WindowHandleHint';
afterEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('shows separate hints once per player and window kind',()=>{
 const view=render(<WindowHandleHint owner="one" kind="games"/>);
 expect(screen.getByText('Окно игр можно двигать')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Скрыть подсказку'}));
 expect(screen.queryByRole('status')).toBeNull();
 view.rerender(<WindowHandleHint owner="one" kind="messages"/>);
 expect(screen.getByText('Размер сообщений можно менять')).toBeVisible();
 view.rerender(<WindowHandleHint owner="one" kind="games"/>);
 expect(screen.queryByRole('status')).toBeNull();
 view.rerender(<WindowHandleHint owner="two" kind="games"/>);
 expect(screen.getByText('Окно игр можно двигать')).toBeVisible();
});
it('does not repeat after closing and reopening without dismissing the hint',()=>{
 const view=render(<WindowHandleHint owner="reopen" kind="games"/>);
 expect(screen.getByRole('status')).toBeVisible();view.unmount();
 render(<WindowHandleHint owner="reopen" kind="games"/>);
 expect(screen.queryByRole('status')).toBeNull();
});
it('still works once during a session when storage is unavailable',()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('unavailable');});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('unavailable');});
 const view=render(<WindowHandleHint owner="no-storage" kind="messages"/>);
 expect(screen.getByRole('status')).toBeVisible();view.unmount();
 render(<WindowHandleHint owner="no-storage" kind="messages"/>);
 expect(screen.queryByRole('status')).toBeNull();
});

it('remembers the shared shortcut hint separately from the window hints',()=>{
 const view=render(<WindowHandleHint owner="shortcut-player" kind="shortcuts"/>);
 expect(screen.getByRole('status',{name:'Подсказка: игры и сообщения'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Скрыть подсказку'}));
 view.unmount();
 const next=render(<WindowHandleHint owner="shortcut-player" kind="shortcuts"/>);
 expect(screen.queryByRole('status')).toBeNull();
 next.rerender(<WindowHandleHint owner="shortcut-player" kind="games"/>);
 expect(screen.getByRole('status')).toBeVisible();
});
