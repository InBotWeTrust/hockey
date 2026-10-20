import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {BarMemoryControls} from './BarMemoryControls.js';
import {fetchMemory,changeMemory} from './memoryApi.js';
import {ApiError} from '../api/apiFetch.js';
vi.mock('./memoryApi.js',()=>({fetchMemory:vi.fn(),changeMemory:vi.fn()}));
const note={id:'note',kind:'fact',content:'Я люблю чай.',quote:'Я люблю чай.',sourceTurnId:'turn',version:2,provenance:'message',updatedAt:'now'};
const view={enabled:true,revision:3,facts:[note]};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(fetchMemory).mockResolvedValue(view);});
it('edits a versioned note and refreshes the conversation',async()=>{
 const changed=vi.fn().mockResolvedValue(undefined);vi.mocked(changeMemory).mockResolvedValue({...view,facts:[{...note,content:'Я люблю кофе.',version:3}]});
 render(<BarMemoryControls character="maria" name="Мария" onChanged={changed}/>);
 await screen.findByText('Ты любишь чай.');fireEvent.click(screen.getByRole('button',{name:'Редактировать заметку'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Я люблю кофе.'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
 expect(changeMemory).toHaveBeenCalledWith('maria',{type:'edit',id:'note',version:2,content:'Я люблю кофе.'});
 expect(await screen.findByText('Ты любишь кофе.')).toBeInTheDocument();
});
it('requires explicit confirmation and includes the revision when clearing',async()=>{
 vi.mocked(changeMemory).mockResolvedValue({...view,facts:[],revision:4});
 render(<BarMemoryControls character="maria" name="Мария" onChanged={async()=>{}}/>);
 await screen.findByText('Ты любишь чай.');fireEvent.click(screen.getByRole('button',{name:'Удалить переписку и память'}));
 expect(changeMemory).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Да, удалить'}));
 await waitFor(()=>expect(changeMemory).toHaveBeenCalledWith('maria',{type:'clear',revision:3}));
});
it('keeps a rejected edit and explains a version conflict',async()=>{
 vi.mocked(changeMemory).mockRejectedValue(new ApiError(409,'memory_conflict','conflict'));
 render(<BarMemoryControls character="maria" name="Мария" onChanged={async()=>{}}/>);
 await screen.findByText('Ты любишь чай.');fireEvent.click(screen.getByRole('button',{name:'Редактировать заметку'}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Кофе'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));
 await screen.findByRole('alert');expect(screen.getByRole('textbox')).toHaveValue('Кофе');
});
it('does not refresh a closed conversation when a mutation finishes late',async()=>{
 let resolve!:(data:typeof view)=>void;vi.mocked(changeMemory).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const changed=vi.fn();const node=render(<BarMemoryControls character="maria" name="Мария" onChanged={changed}/>);
 await screen.findByText('Ты любишь чай.');fireEvent.click(screen.getByRole('button',{name:'Удалить заметку'}));node.unmount();resolve(view);
 await Promise.resolve();expect(changed).not.toHaveBeenCalled();
});

it('identifies the player as the subject and keeps source wording unchanged',async()=>{
 vi.mocked(fetchMemory).mockResolvedValue({...view,facts:[{...note,content:'Я предпочитаю кофе.',quote:'Я предпочитаю кофе.'}]});
 render(<BarMemoryControls character="maria" name="Мария" onChanged={async()=>{}}/>);
 expect(await screen.findByRole('heading',{name:'Что Мария знает о тебе'})).toBeInTheDocument();
 expect(await screen.findByText('Ты предпочитаешь кофе.')).toBeInTheDocument();
 expect(screen.getByText('Я предпочитаю кофе.')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Редактировать заметку'}).textContent).toBe('');
 expect(screen.getByRole('button',{name:'Удалить заметку'}).textContent).toBe('');
});
it('labels complex notes as the player words rather than changing their meaning',async()=>{
 vi.mocked(fetchMemory).mockResolvedValue({...view,facts:[{...note,content:'Я люблю кофе. Мария любит чай.'}]});
 render(<BarMemoryControls character="maria" name="Мария" onChanged={async()=>{}}/>);
 expect(await screen.findByText('Твои слова: «Я люблю кофе. Мария любит чай.»')).toBeInTheDocument();
});
