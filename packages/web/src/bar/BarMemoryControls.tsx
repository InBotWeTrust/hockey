import { RotateCw, Pencil, Trash2 } from 'lucide-react';
import {useEffect,useState,useRef} from 'react';
import type {BarCharacter} from './conversationApi.js';
import {changeMemory,fetchMemory,type MemoryView,type MemoryChange} from './memoryApi.js';
import {ApiError} from '../api/apiFetch.js';
function noteForPlayer(content:string) {
  const preference=/^я (не )?(предпочитаю|люблю) ([^.!?\n]+)[.!?]?$/i.exec(content.trim());
  if(preference && preference[2] && preference[3]) return `Ты ${preference[1] ?? ''}${preference[2].toLowerCase()==='предпочитаю' ? 'предпочитаешь' : 'любишь'} ${preference[3]}.`;
  return `Твои слова: «${content}»`;
}
export function BarMemoryControls({character,name,onChanged}:{character:BarCharacter;name:string;onChanged:()=>Promise<void>}) {
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [data,setData]=useState<MemoryView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [retry,setRetry]=useState(0),[editing,setEditing]=useState<string|null>(null),[text,setText]=useState(''),[clear,setClear]=useState(false);
  useEffect(()=>{let alive=true;setData(null);setError('');fetchMemory(character).then(value=>{if(alive)setData(value);}).catch(()=>{if(alive)setError('Не удалось загрузить память.');});return()=>{alive=false;};},[character,retry]);
  const apply=async(action:MemoryChange)=>{
    if(busy)return;setBusy(true);setError('');
    try {const value=await changeMemory(character,action);if(!mounted.current)return;setData(value);setEditing(null);setClear(false);await onChanged();}
    catch(cause){if(!mounted.current)return;setError(cause instanceof ApiError && cause.status===409 ? 'Запись изменилась или не подходит для памяти. Обнови список.' : 'Не удалось сохранить изменение. Попробуй ещё раз.');}
    finally{if(mounted.current)setBusy(false);}
  };
  return <section className="bar-memory" aria-label="Память персонажа">
    <div className="bar-memory__heading"><h3>Что {name} знает о тебе</h3><button className="icon-btn" aria-label="Обновить память" title="Обновить память" disabled={busy} onClick={()=>setRetry(n=>n+1)}><RotateCw size={18}/></button></div><p className="bar-memory__hint">Эти заметки видит только этот персонаж.</p>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Загружаем память…</p>}
    {data && <>
      <label className="bar-memory__toggle"><input type="checkbox" checked={data.enabled} disabled={busy} onChange={event=>void apply({type:'enabled',enabled:event.target.checked})}/>Запоминать этот разговор</label>
      <details className="bar-memory__help"><summary>Как это работает</summary><p>Выключишь память, и все заметки удалятся.</p><p>Если исправишь или забудешь заметку, старые сообщения останутся в чате, но персонаж перестанет их учитывать.</p><p>Переписку можно удалить ниже. История партий сохранится.</p></details>
      {!data.facts.length && <p>Сохранённых заметок пока нет.</p>}
      {data.facts.map(note=><article key={note.id} className="bar-memory__note">
        {editing===note.id ? <><label>Исправленная заметка<textarea maxLength={300} value={text} disabled={busy} onChange={event=>setText(event.target.value)}/></label>
          <button className="bar-memory__action bar-memory__action--primary" disabled={busy || !text.trim()} onClick={()=>void apply({type:'edit',id:note.id,version:note.version,content:text.trim()})}>Сохранить</button>
          <button className="bar-memory__action" disabled={busy} onClick={()=>setEditing(null)}>Отмена</button></> : <><div className="bar-memory__note-heading"><p>{noteForPlayer(note.content)}</p><div className="bar-memory__note-actions"><button className="icon-btn" aria-label="Редактировать заметку" title="Редактировать заметку" disabled={busy} onClick={()=>{setEditing(note.id);setText(note.content);}}><Pencil size={16}/></button><button className="icon-btn" aria-label="Удалить заметку" title="Удалить заметку" disabled={busy} onClick={()=>void apply({type:'delete',id:note.id,version:note.version})}><Trash2 size={16}/></button></div></div>
          <details><summary>Откуда это известно</summary><p>{note.provenance==='user_edit' ? 'Исправлено тобой в настройках памяти.' : note.quote}</p></details>
</>}
      </article>)}
      {clear ? <div className="bar-memory__confirm" role="group" aria-label="Подтверждение удаления"><p>Удалить всю переписку и память с этим персонажем? Вернуть их не получится. Партии останутся.</p>
        <button className="bar-memory__action bar-memory__action--primary" disabled={busy} onClick={()=>void apply({type:'clear',revision:data.revision})}>Да, удалить</button>
        <button className="bar-memory__action" disabled={busy} onClick={()=>setClear(false)}>Отмена</button></div> : <button className="profile-logout-btn profile-logout-btn--danger bar-memory__delete" disabled={busy} onClick={()=>setClear(true)}>Удалить переписку и память</button>}
    </>}
  </section>;
}
