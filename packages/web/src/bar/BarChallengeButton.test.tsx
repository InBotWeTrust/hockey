import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { BarChallengeButton } from './BarChallengeButton.js';
import { gameApi } from './games/api.js';
import { apiFetch } from '../api/apiFetch.js';
vi.mock('./games/api.js',()=>({gameApi:{invite:vi.fn().mockResolvedValue({id:'invite'})}}));
vi.mock('../api/apiFetch.js',()=>({apiFetch:vi.fn().mockResolvedValue({roomId:'room'})}));
beforeEach(()=>{vi.clearAllMocks();});
function open(){render(<MemoryRouter><BarChallengeButton userId="other" name="Александр" avatarUrl="/avatar.png"/></MemoryRouter>);fireEvent.click(screen.getByText('Предложить сыграть в баре'));}
it('reveals the required table sizes after selecting cards, without scrolling other games',()=>{
 const targets:HTMLElement[]=[];
 const original=HTMLElement.prototype.scrollIntoView;
 HTMLElement.prototype.scrollIntoView=function(){targets.push(this);};
 try {
  open();fireEvent.click(screen.getByRole('button',{name:'Бильярд'}));expect(targets).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Карты'}));
  expect(targets).toHaveLength(1);
  expect(targets[0]).toContainElement(screen.getByRole('group',{name:'Размер стола'}));
  expect(screen.getByRole('button',{name:'Предложить'})).toBeDisabled();
 } finally {HTMLElement.prototype.scrollIntoView=original;}
});
it('keeps one bottom action disabled until a game is selected',()=>{
 open();expect(screen.getByRole('button',{name:'Предложить'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Морской бой'}));
 expect(screen.getByRole('button',{name:'Предложить'})).toBeEnabled();
 expect(gameApi.invite).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Морской бой'}));
 expect(screen.getByRole('button',{name:'Предложить'})).toBeDisabled();
});
it('sends the selected game only through the bottom action',async()=>{
 open();fireEvent.click(screen.getByRole('button',{name:'Морской бой'}));fireEvent.click(screen.getByRole('button',{name:'Предложить'}));
 await waitFor(()=>expect(gameApi.invite).toHaveBeenCalledWith('battleship','other'));
});
it('supports multiple table sizes and disables sending when all are deselected',async()=>{
 open();fireEvent.click(screen.getByRole('button',{name:'Карты'}));
 const send=screen.getByRole('button',{name:'Предложить'});expect(send).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'2 игрока'}));fireEvent.click(screen.getByRole('button',{name:'6 игроков'}));
 expect(screen.getByRole('button',{name:'2 игрока'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(send);
 await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith('/bar/cards/profile-invites',{method:'POST',body:JSON.stringify({userId:'other',capacity:[2,6]})}));
});
it('requires a table size again after deselecting the last format',()=>{
 open();fireEvent.click(screen.getByRole('button',{name:'Карты'}));
 const two=screen.getByRole('button',{name:'2 игрока'});fireEvent.click(two);fireEvent.click(two);
 expect(screen.getByRole('button',{name:'Предложить'})).toBeDisabled();
});
