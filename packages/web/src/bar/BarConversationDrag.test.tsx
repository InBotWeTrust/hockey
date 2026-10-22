import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {BarConversation} from './BarConversation.js';
import {fetchConversation} from './conversationApi.js';
vi.mock('./conversationApi.js',()=>({fetchConversation:vi.fn(),sendConversation:vi.fn()}));
const snapshot={revision:0,greeting:'Привет!',pending:false,turns:[]};
vi.mocked(fetchConversation).mockResolvedValue(snapshot);
it('has no grabber and expands from the card identity or button without swipe controls',async()=>{
 const close=vi.fn();render(<BarConversation character="maria" name="Мария" onClose={close} onUpdate={()=>{}}/>);await screen.findByText(snapshot.greeting);
 expect(screen.getByRole('dialog').parentElement).toHaveStyle({background:'rgba(0, 0, 0, 0.12)'});
 expect(document.querySelector('.bar-conversation .sheet-drag-handle')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Развернуть карточку разговора'}));
 expect(screen.getByRole('dialog')).toHaveClass('bar-conversation--expanded');
 fireEvent.click(screen.getByRole('button',{name:'Свернуть разговор'}));
 expect(screen.getByRole('dialog')).not.toHaveClass('bar-conversation--expanded');
 fireEvent.click(screen.getByRole('button',{name:'Развернуть разговор'}));
 expect(screen.getByRole('dialog')).toHaveClass('bar-conversation--expanded');
 expect(close).not.toHaveBeenCalled();
});
