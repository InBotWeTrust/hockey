import { Fragment, useEffect, useState, type ReactNode } from 'react';
import './social.css';
import { HistoryDayHeading } from './HistoryDayHeading.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { findOrCreateDM } from '../chat/api.js';
import { chatKeys } from '../lib/queryKeys.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { ExperienceRatingModal } from '../profile/ExperienceRatingModal.js';
import { SegmentedTabs } from '../components/SegmentedTabs.js';
import { UserAvatar } from '../chat/components/UserAvatar.js';
import { UserProfileSheet } from '../chat/components/UserProfileSheet.js';
import { X, Trash2, Settings, ArrowLeft, UserMinus, Users, User } from 'lucide-react';
import { useSocial } from './SocialContext.js';
import { useSocialPage } from './useSocialPage.js';
import type { FanSummary, SocialUser } from './api.js';

export function SocialUserPreview({user,onClose}:{user:SocialUser;onClose:()=>void}):JSX.Element {
 const {renderProfile}=useSocial();
 return <>{renderProfile ? renderProfile(user,onClose) : <UserProfileSheet sender={{userId:user.id,displayName:user.displayName,avatarUrl:user.avatarUrl,accountKind:'player'}} onClose={onClose}/>}</>;
}
export function SocialProfile({userId,profileContent,renderIdentity,onMessageOpened}:{onMessageOpened?:(()=>void)|undefined;userId:string;profileContent?:ReactNode;renderIdentity?:(counts:ReactNode)=>ReactNode}):JSX.Element|null {
 const {api,viewerId,openMessage}=useSocial(); const client=useQueryClient(); const navigate=useNavigate();
 const message=useMutation({mutationFn:async()=>{
  if(openMessage){await openMessage(userId);onMessageOpened?.();return;}
  const result=await findOrCreateDM(userId);
  if(result.created)void client.invalidateQueries({queryKey:chatKeys.list()});
  navigate(`/chat/${result.chatId}`);
  onMessageOpened?.();
 }});
 const [params,setParams]=useSearchParams();
 const [open,setOpen]=useState<'fans'|'following'|'rating'|null>(null);
 const [pushTarget,setPushTarget]=useState<string|null>(null);
 const pushProfile=useQuery({queryKey:['social',viewerId,'push-profile',pushTarget],queryFn:()=>api.profile(pushTarget!),enabled:Boolean(pushTarget),retry:false});
 const summaryKey=['social',viewerId,'summary',userId];
 const summary=useQuery({queryKey:summaryKey,queryFn:()=>api.summary(userId),enabled:Boolean(viewerId&&userId)});
 const own=viewerId===userId;
 const mutation=useMutation({mutationFn:(following:boolean)=>api.follow(userId,following),onSuccess:(data:FanSummary)=>{
  client.setQueryData(summaryKey,data);
  client.removeQueries({queryKey:['social',viewerId,'event']});
  void client.invalidateQueries({predicate:q=>q.queryKey[0]==='social'&&!(q.queryKey[2]==='summary'&&q.queryKey[3]===userId)});
 }});
 const pushedId=params.get('fanId'); const fromPush=params.get('social')==='fans';
 useEffect(()=>{
  if(!own||!fromPush) return;
  setOpen('fans');
  const id=pushedId;
  const next=new URLSearchParams(params);next.delete('social');next.delete('fanId');setParams(next,{replace:true});
  if(id)setPushTarget(id);
 },[own,fromPush,pushedId]);
 if(!viewerId)return <>{renderIdentity?.(null)}{profileContent}</>;
 const data=summary.data;
 const countContent=<><span className="profile-social-count"><strong>{data?.followersCount??'—'}</strong><span>{fanWord(data?.followersCount??0)}</span></span><span aria-hidden="true" className="profile-social-separator">·</span><span className="profile-social-count">{data?.followingCount===0?<span>Пока ни за кого не {own?'болею':'болеет'}</span>:<><span>{own?'Болею':'Болеет'} за</span><strong>{data?.followingCount??'—'}</strong><span>{playerWord(data?.followingCount??0)}</span></>}</span></>;
 const counts=own?<button className="profile-social-count-block profile-social-counts" aria-label="Рейтинг болельщиков" onClick={()=>setOpen('rating')}>{countContent}</button>:<div className="profile-social-counts">{countContent}</div>;
 return <section aria-label="Болельщики" style={{margin:'12px 0'}}>
  {renderIdentity?renderIdentity(counts):counts}
  {data?.canFollow&&<div className="profile-social-actions">
   <button className={data.following?'btn btn--ghost':'btn btn--cta'} disabled={mutation.isPending} onClick={()=>mutation.mutate(!data.following)}>{mutation.isPending?'Подождите…':data.following?'Перестать болеть':'Стать болельщиком'}</button>
   <button className="btn btn--ghost" disabled={message.isPending} onClick={()=>message.mutate()}>{message.isPending?'Открываем…':'Написать'}</button>
  </div>}
  {message.isError&&<p role="alert" className="modal-copy">Не удалось открыть личный чат. Попробуйте ещё раз.</p>}
  {profileContent!==undefined&&<div style={{marginTop:12}}>{profileContent}</div>}
  {mutation.isError&&<p role="alert" className="modal-copy">{mutation.error instanceof Error?mutation.error.message:'Не удалось изменить подписку'}</p>}
  {summary.isError&&<div className="social-error-state"><button className="social-retry-link" onClick={()=>void summary.refetch()}>Повторить загрузку</button></div>}
  {open&&<FanRating userId={userId} managing={open!=='rating'} initialTab={open==='following'?'following':'fans'} onClose={()=>{setOpen(null);setPushTarget(null);}} onManage={()=>setOpen('fans')} onBack={()=>setOpen('rating')} notice={pushTarget&&pushProfile.isError?'Профиль болельщика недоступен':null}/>}
  {pushTarget&&pushProfile.data&&!pushProfile.isError&&<SocialUserPreview user={pushProfile.data} onClose={()=>setPushTarget(null)}/>}
 </section>;
}

function fanWord(count:number):string {
 const last=count%10,tail=count%100;
 return tail>=11&&tail<=14?'болельщиков':last===1?'болельщик':last>=2&&last<=4?'болельщика':'болельщиков';
}
function playerWord(count:number):string {
 return count%10===1&&count%100!==11?'игрока':'игроков';
}
function FanRating({userId,managing,initialTab,onClose,onManage,onBack,notice}:{userId:string;managing:boolean;initialTab:'fans'|'following';onClose:()=>void;onManage:()=>void;onBack:()=>void;notice:string|null}):JSX.Element {
 const {api,viewerId}=useSocial();const [selected,setSelected]=useState<SocialUser|null>(null);
 return <><ExperienceRatingModal currentUserId={viewerId??''} onCurrentUser={()=>{}} onClose={onClose} source={{key:['social',viewerId,'fan-rating'],title:managing?'Управление болельщиками':'Зрелищность',heading:'Болельщики',icon:managing?<User aria-hidden="true"/>:<Users aria-hidden="true"/>,load:async cursor=>{const page=await api.fanRating(cursor??undefined);return {rows:page.items.map(p=>({place:p.place,userId:p.id,displayName:p.displayName,avatarUrl:p.avatarUrl,experience:p.count})),nextCursor:page.nextCursor,...(page.currentUser?{currentUser:{place:page.currentUser.place,userId:page.currentUser.id,displayName:page.currentUser.displayName,avatarUrl:page.currentUser.avatarUrl,experience:page.currentUser.count}}:{})};},headerAction:<button className="icon-btn" aria-label={managing?'Назад в рейтинг':'Управление болельщиками'} onClick={managing?onBack:onManage}>{managing?<ArrowLeft size={16}/>:<Settings size={16}/>}</button>,...(managing?{content:<FansDialog userId={userId} initialTab={initialTab} notice={notice}/>} : {}),onPlayerClick:row=>setSelected({id:String(row.user_id),displayName:String(row.display_name),avatarUrl:typeof row.avatar_url==='string'?row.avatar_url:null})}}/>{selected&&<SocialUserPreview user={selected} onClose={()=>setSelected(null)}/>}</>;
}

function FansDialog({userId,initialTab,notice}:{userId:string;initialTab:'fans'|'following';notice?:string|null}):JSX.Element {
 const {api,viewerId}=useSocial(); const [tab,setTab]=useState<'fans'|'following'>(initialTab);
 const [selected,setSelected]=useState<SocialUser|null>(null);
 const [removeTarget,setRemoveTarget]=useState<SocialUser|null>(null);
 const [unfollowTarget,setUnfollowTarget]=useState<SocialUser|null>(null);
 const client=useQueryClient();
 const remove=useMutation({mutationFn:(fanId:string)=>api.removeFan(fanId),onSuccess:data=>{
  client.setQueryData(['social',viewerId,'summary',userId],data);setRemoveTarget(null);
  void client.invalidateQueries({queryKey:['social',viewerId,'people']});
 }});
 const own=viewerId===userId;
 const unfollow=useMutation({mutationFn:(id:string)=>api.follow(id,false),onSuccess:async()=>{
  setUnfollowTarget(null);
  await client.invalidateQueries({predicate:q=>q.queryKey[0]==='social'&&q.queryKey[1]===viewerId});
 }});
 const rows=useSocialPage(['people',userId,tab],c=>api.people(userId,tab,c));
 return <>
  <div className="social-people-sheet">
  <div style={{marginBottom:12}}><SegmentedTabs ariaLabel="Списки игроков" activeTab={tab} onChange={setTab} items={[{id:'fans',label:'Мои болельщики'},{id:'following',label:own?'Болею за':'Болеет за'}]}/></div>
  {notice&&<p role="status" className="modal-copy">{notice}</p>}
  {rows.isLoading?<p className="modal-copy">Загрузка…</p>:rows.isError?<p role="alert" className="modal-copy">Не удалось загрузить список <button className="btn btn--ghost" onClick={()=>void rows.refetch()}>Повторить</button></p>:<div className="social-people-list">
   {!rows.items.length&&<p className="modal-copy">Здесь пока никого нет</p>}
   {rows.items.map((item,index)=>{
    const history='action' in item?item:null; const id=history&&'userId' in history?String(history.userId):item.id;
    const date=history&&'occurredAt' in history?new Date(String(history.occurredAt)):null;
    const previous=rows.items[index-1];
    const previousDate=previous&&'occurredAt' in previous?new Date(String(previous.occurredAt)):null;
    const showDate=date&&date.toDateString()!==previousDate?.toDateString();
    return <Fragment key={item.id}>{showDate&&<HistoryDayHeading iso={date.toISOString()}/>}<div style={{display:'flex',alignItems:'center',gap:8}}><button className="social-history-row" style={{flex:1,minWidth:0}} onClick={()=>setSelected({...item,id})}>
     <UserAvatar avatarUrl={item.avatarUrl} name={item.displayName} size={40}/><span className="social-history-copy"><strong>{item.displayName}</strong>{history&&<span className={history.action==='follow'?'social-history-follow':'social-history-unfollow'}>{history.action==='follow'?'Стал вашим болельщиком':history.action==='remove'?'Вы удалили игрока из болельщиков':'Перестал болеть за вас'}</span>}</span>
    </button>{own&&tab==='fans'&&<button className="icon-btn" aria-label={`Удалить ${item.displayName} из болельщиков`} onClick={()=>{remove.reset();setRemoveTarget(item);}}><Trash2 size={16}/></button>}{own&&tab==='following'&&<button className="icon-btn" aria-label={`Перестать болеть за ${item.displayName}`} onClick={()=>{unfollow.reset();setUnfollowTarget(item);}}><UserMinus size={16}/></button>}</div></Fragment>;
   })}
  </div>}
  {rows.hasNextPage&&<button className="btn btn--ghost" disabled={rows.isFetchingNextPage} onClick={()=>void rows.fetchNextPage()}>Показать ещё</button>}
  </div>
 {selected&&<SocialUserPreview user={selected} onClose={()=>setSelected(null)}/>}
 {unfollowTarget&&<AccessibleModal title="Перестать болеть?" onClose={()=>setUnfollowTarget(null)} closeBlocked={unfollow.isPending} headerAction={<button className="icon-btn" aria-label="Закрыть" disabled={unfollow.isPending} onClick={()=>setUnfollowTarget(null)}><X size={16}/></button>}>
  <p className="modal-copy">Перестать болеть за {unfollowTarget.displayName}? Его игровые события исчезнут из вашей ленты.</p>
  {unfollow.isError&&<p role="alert" className="modal-copy">Не удалось отписаться. Попробуйте ещё раз.</p>}
  <div className="modal-actions"><button className="btn btn--ghost" disabled={unfollow.isPending} onClick={()=>setUnfollowTarget(null)}>Отмена</button><button className="modal-primary btn btn--cta" disabled={unfollow.isPending} onClick={()=>unfollow.mutate(unfollowTarget.id)}>{unfollow.isPending?'Подождите…':'Перестать болеть'}</button></div>
 </AccessibleModal>}
 {removeTarget&&<AccessibleModal title="Удалить болельщика?" onClose={()=>setRemoveTarget(null)} closeBlocked={remove.isPending} headerAction={<button className="icon-btn" aria-label="Закрыть" disabled={remove.isPending} onClick={()=>setRemoveTarget(null)}><X size={16}/></button>}>
  <p className="modal-copy">{removeTarget.displayName} перестанет быть вашим болельщиком и потеряет доступ к вашей игровой истории. Позже он сможет подписаться снова.</p>
  {remove.isError&&<p className="modal-copy" role="alert">Не удалось удалить болельщика. Попробуйте ещё раз.</p>}
  <div className="modal-actions"><button className="btn btn--ghost" disabled={remove.isPending} onClick={()=>setRemoveTarget(null)}>Отмена</button><button className="modal-primary btn btn--cta" disabled={remove.isPending} onClick={()=>remove.mutate(removeTarget.id)}>{remove.isPending?'Удаляем…':'Удалить болельщика'}</button></div>
 </AccessibleModal>}</>;
}
