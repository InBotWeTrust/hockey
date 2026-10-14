-- Convert the seven fan milestones to native levels without granting rewards again.
insert into achievements(id,photo_url,title,description,requirement,category,availability,reward_currency,reward_stars,reward_experience,reward_tokens,sort_order)
values('fans-support','/achievements/fans-1.webp?v=20261013','Болельщики','Трибуны поддерживают тебя.','Набрать 1 болельщика.','career','active',0,0,0,0,30000);
update achievements set availability='hidden',updated_at=now() where id ~ '^fans-[0-9]+$';
insert into achievement_stages(achievement_id,stage_number,requirement,target,reward_stars,reward_experience)
select 'fans-support',ordinal,'Набрать '||threshold||case when threshold=1 then ' болельщика.' else ' болельщиков.' end,
 jsonb_build_object('followers',threshold),reward,reward
from (values(1,1,5),(2,10,10),(3,20,15),(4,50,30),(5,100,50),(6,500,140),(7,1000,250)) as levels(ordinal,threshold,reward);

create temporary table fans_levels_peak on commit drop as
select u.id as user_id,greatest(
 (select count(*)::int from user_follows f where f.player_id=u.id),
 coalesce((select max(greatest(substring(a.achievement_id from 6)::int,
   case when jsonb_typeof(a.completion_context->'followersCount')='number' then (a.completion_context->>'followersCount')::int else 0 end))
   from user_achievements a where a.user_id=u.id and a.achievement_id ~ '^fans-[0-9]+$'),0)) as followers
from users u where u.account_kind='player';
insert into achievement_progress(user_id,key,state)
select user_id,'fans-support',jsonb_build_object('followers',followers) from fans_levels_peak;

-- Historical claims are a transfer, not new feed activity or new economy grants.
alter table user_achievement_stages disable trigger social_achievement_stage;
insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at,progress,completed_at,claimed_at,completion_context,reward_snapshot)
select legacy.user_id,'fans-support',stage.stage_number,legacy.completed_at,jsonb_build_object('followers',peak.followers),
 legacy.completed_at,legacy.claimed_at,legacy.completion_context,
 jsonb_build_object('currency',old.reward_currency,'stars',old.reward_stars,'experience',old.reward_experience,'tokens',old.reward_tokens)
from user_achievements legacy
join achievements old on old.id=legacy.achievement_id
join fans_levels_peak peak on peak.user_id=legacy.user_id
join achievement_stages stage on stage.achievement_id='fans-support' and stage.target->>'followers'=substring(legacy.achievement_id from 6)
where legacy.achievement_id ~ '^fans-[0-9]+$' and legacy.claimed_at is not null;

insert into user_achievement_stages(user_id,achievement_id,stage_number,opened_at,progress,completed_at,completion_context)
select peak.user_id,'fans-support',next.stage_number,now(),jsonb_build_object('followers',peak.followers),
 case when peak.followers >= (next.target->>'followers')::int then now() end,jsonb_build_object('source','legacy_fan_levels')
from fans_levels_peak peak
cross join lateral(select stage.stage_number,stage.target from achievement_stages stage
 where stage.achievement_id='fans-support' and not exists(select 1 from user_achievement_stages claimed
   where claimed.user_id=peak.user_id and claimed.achievement_id='fans-support' and claimed.stage_number=stage.stage_number)
 order by stage.stage_number limit 1) next;
alter table user_achievement_stages enable trigger social_achievement_stage;
