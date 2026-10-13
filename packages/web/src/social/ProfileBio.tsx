import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { useSocial } from './SocialContext.js';
import './social.css';

export function ProfileBio({userId,editor=false}:{userId:string;editor?:boolean}):JSX.Element {
 const {api,viewerId}=useSocial();const client=useQueryClient();
 const key=['social',viewerId,'bio',userId];
 const bio=useQuery({queryKey:key,queryFn:()=>api.bio(userId),enabled:Boolean(viewerId&&api.bio)});
 const [editing,setEditing]=useState(false);const [draft,setDraft]=useState('');
 const length=Array.from(draft).length;
 const save=useMutation({mutationFn:()=>api.saveBio(draft),onSuccess:data=>{client.setQueryData(key,data);setEditing(false);}});
 return <>
  {!editor&&bio.data?.bio&&<p className="profile-bio">{bio.data.bio}</p>}
  {editor&&viewerId===userId&&<button className="btn btn--ghost" onClick={()=>{setDraft(bio.data?.bio??'');save.reset();setEditing(true);}} disabled={bio.isLoading||bio.isError}>Редактировать описание</button>}
  {editor&&bio.isError&&viewerId===userId&&<button className="profile-social-count" onClick={()=>void bio.refetch()}>Повторить загрузку описания</button>}
  {editing&&<AccessibleModal title="О себе" onClose={()=>setEditing(false)} closeBlocked={save.isPending} headerAction={<button className="icon-btn" aria-label="Закрыть" disabled={save.isPending} onClick={()=>setEditing(false)}><X size={16}/></button>}>
   <label htmlFor="profile-bio">Описание</label>
   <textarea id="profile-bio" className="input" rows={3} value={draft} disabled={save.isPending} onChange={e=>{if(Array.from(e.target.value).length<=160)setDraft(e.target.value);}} style={{width:'100%',resize:'vertical'}} aria-describedby="profile-bio-count"/>
   <p id="profile-bio-count" className="modal-copy">{length} / 160</p>
   {save.isError&&<p className="modal-copy" role="alert">Не удалось сохранить описание. Попробуйте ещё раз.</p>}
   <div className="modal-actions"><button className="btn btn--ghost" disabled={save.isPending} onClick={()=>setEditing(false)}>Отмена</button><button className="modal-primary btn btn--cta" disabled={save.isPending||length>160} onClick={()=>save.mutate()}>{save.isPending?'Сохраняем…':'Сохранить'}</button></div>
  </AccessibleModal>}
 </>;
}
