import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,act} from '@testing-library/react';
import {BarConversation} from './BarConversation.js';
import {fetchConversation} from './conversationApi.js';
vi.mock('./conversationApi.js',()=>({fetchConversation:vi.fn(),sendConversation:vi.fn()}));
const snapshot={revision:0,greeting:'Привет!',pending:false,turns:[]};
vi.mocked(fetchConversation).mockResolvedValue(snapshot);
it('expands and collapses from the top handle without closing the conversation',async()=>{
 const close=vi.fn();render(<BarConversation character="maria" name="Мария" onClose={close} onUpdate={()=>{}}/>);await screen.findByText(snapshot.greeting);
 const handle=document.querySelector('.bar-conversation .sheet-drag-handle');expect(handle).not.toBeNull();
 const drag=async(from:number,to:number)=>{
  const pointer={pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:100};
  fireEvent.pointerDown(handle!,{...pointer,clientY:from});fireEvent.pointerMove(window,{...pointer,clientY:to});
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
  fireEvent.pointerUp(window,{...pointer,clientY:to});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
 };
 await drag(300,180);expect(screen.getByRole('dialog')).toHaveClass('bar-conversation--expanded');
 await drag(180,300);expect(screen.getByRole('dialog')).not.toHaveClass('bar-conversation--expanded');expect(close).not.toHaveBeenCalled();
 await drag(300,310);expect(screen.getByRole('dialog')).not.toHaveClass('bar-conversation--expanded');
});
